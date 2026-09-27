import fs from "fs";
import path from "path";

/**
 * Persistence for leads and chat interactions.
 *
 * Why this exists (P0-01): every write used to be `fs.writeFileSync` into
 * `process.cwd()/data`. On Vercel the only writable path is `/tmp`, it is
 * per-instance and not shared, so those writes either fail or vanish — and the
 * old catch blocks swallowed the error while the API still answered `success`.
 *
 * The honest model is therefore:
 *
 *   1. **Production + a configured durable store** → write there. This is the
 *      only configuration where a lead is actually guaranteed to survive.
 *   2. **Everything else** → local JSONL under `data/` for `next dev`,
 *      `next start` and self-hosted runs.
 *   3. **Production with no store configured** → the write is refused and
 *      reported as a failure, so the API can return a non-2xx instead of
 *      thanking a recruiter for a note it just dropped.
 *
 * `data/` is gitignored, so a serverless deploy would additionally lose the
 * directory itself — the point is to never claim a successful save we did not
 * actually make.
 */

export interface StoredLead {
  timestamp: string;
  email: string;
  name: string;
  message: string;
}

export interface StoredInteraction {
  timestamp: string;
  userMessage: string;
  replySnippet?: string;
  recruiterEmail?: string;
}

export interface PersistResult {
  ok: boolean;
  /** Which backend accepted the write, when it succeeded. */
  store?: "http" | "local-jsonl";
  error?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Optional durable endpoint. Point `LEADS_ENDPOINT` at any service that accepts
 * a JSON `POST` (Vercel KV/Upstash via a tiny function, Airtable, a webhook…).
 * `LEADS_ENDPOINT_TOKEN` is sent as a bearer token when present.
 */
function leadsEndpoint(): string | null {
  const endpoint = process.env.LEADS_ENDPOINT?.trim();
  return endpoint ? endpoint : null;
}

/** True when a durable store will actually be used in this environment. */
export function hasDurableStore(): boolean {
  return Boolean(leadsEndpoint());
}

/**
 * Explains, in one line, why persistence is not durable — surfaced in API error
 * messages and logs so the failure mode is never silent.
 */
export function describeStoreConfiguration(): string {
  if (hasDurableStore()) {
    return "Durable leads endpoint configured (LEADS_ENDPOINT).";
  }
  if (isProduction()) {
    return "No durable store configured: set LEADS_ENDPOINT (the filesystem is not writable/persistent on serverless).";
  }
  return "Local development store: appending to data/*.jsonl (dev only — not durable in production).";
}

/**
 * Appends one JSON line. JSONL is used deliberately: `appendFile` cannot
 * clobber a concurrent write the way a read-modify-write of a whole JSON array
 * can (see P2-18).
 */
function appendJsonLine(fileName: string, record: unknown): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.appendFileSync(
    path.join(DATA_DIR, fileName),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
}

/** Reads at most `limit` most-recent records from a JSONL file. */
export function readJsonLines<T>(fileName: string, limit = 500): T[] {
  const file = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const recent = lines.slice(-limit);
  const records: T[] = [];

  for (const line of recent) {
    try {
      records.push(JSON.parse(line) as T);
    } catch {
      // Skip a torn/partial line rather than failing the whole read.
    }
  }

  return records;
}

async function persistToEndpoint(
  kind: "lead" | "interaction",
  record: StoredLead | StoredInteraction,
): Promise<void> {
  const endpoint = leadsEndpoint();
  if (!endpoint) throw new Error("No leads endpoint configured.");

  const token = process.env.LEADS_ENDPOINT_TOKEN?.trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kind, record }),
    // Never let a slow sink hang the request past the function timeout.
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Durable store responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
}

/**
 * Persists a record, preferring the durable store and falling back to local
 * JSONL only outside production.
 */
export async function persistRecord(
  kind: "lead" | "interaction",
  record: StoredLead | StoredInteraction,
  localFileName: string,
): Promise<PersistResult> {
  if (hasDurableStore()) {
    try {
      await persistToEndpoint(kind, record);
      return { ok: true, store: "http" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown store error";
      console.error(`[persist] durable write failed for ${kind}:`, message);
      return { ok: false, store: "http", error: message };
    }
  }

  if (isProduction()) {
    // Refuse rather than pretend: a write we cannot keep is not a success.
    const error = describeStoreConfiguration();
    console.error(
      `[persist] refusing non-durable write for ${kind} in production.`,
      error,
    );
    return { ok: false, error };
  }

  try {
    appendJsonLine(localFileName, record);
    return { ok: true, store: "local-jsonl" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown file error";
    console.error(`[persist] local write failed for ${kind}:`, message);
    return { ok: false, store: "local-jsonl", error: message };
  }
}

/** Lead records — `data/leads.jsonl` in development. */
export function saveLead(lead: StoredLead): Promise<PersistResult> {
  return persistRecord("lead", lead, "leads.jsonl");
}

/** Chat interaction records — `data/conversations.jsonl`. */
export function saveInteraction(
  interaction: StoredInteraction,
): Promise<PersistResult> {
  return persistRecord("interaction", interaction, "conversations.jsonl");
}
