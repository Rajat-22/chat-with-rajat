/**
 * In-memory, per-IP token bucket for the expensive endpoints.
 *
 * The documented mitigation for expensive endpoints (sending email, spending
 * model quota) is rate limiting — see `node_modules/next/dist/docs`:
 *   - `01-app/02-guides/data-security.md:476`
 *   - `01-app/02-guides/backend-for-frontend.md:783-815`
 *
 * The guide's example is deliberately abstract (`checkRateLimit(request)`),
 * because the right store depends on the host. This implementation keeps the
 * same shape but is honest about its limits:
 *
 *   - State lives in the module scope of the server instance. A single
 *     long-lived Node server (local dev, `next start`, Docker) enforces it
 *     exactly. On serverless, each warm instance keeps its own buckets, so the
 *     effective limit is `limit × instances` — it still stops a single client
 *     from looping, but it is NOT a global quota.
 *   - For a real global limit, move `consume()` to Upstash Ratelimit / Vercel
 *     KV / `@vercel/firewall`. Only this file has to change.
 */

export interface RateLimitRule {
  /** Bucket capacity — the number of requests allowed in a full window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  /** Whole seconds until at least one token is available again. */
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** chat: 20 requests / 5 min per IP. */
export const CHAT_RATE_LIMIT: RateLimitRule = {
  limit: 20,
  windowMs: 5 * 60_000,
};
/** lead: 5 requests / 15 min per IP. */
export const LEAD_RATE_LIMIT: RateLimitRule = {
  limit: 5,
  windowMs: 15 * 60_000,
};

/** Hard cap on tracked buckets so a spoofed-IP flood cannot grow memory forever. */
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

/**
 * Best-effort client identity.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it,
 * so a determined attacker can rotate the value. That is an accepted limitation
 * of an in-process limiter — it raises the cost of abuse rather than being a
 * security boundary. Proxy/Vercel and the hosting provider's own rate limiting
 * remain the outer layers.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/** Drops the oldest entries once the map outgrows its cap (`Map` preserves insertion order). */
function evictOldest(): void {
  const excess = buckets.size - MAX_TRACKED_KEYS;
  if (excess <= 0) return;

  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++removed >= excess) break;
  }
}

/**
 * Consumes one token for `key`. Pure bookkeeping: no I/O, safe to call on every
 * request.
 */
export function consume(
  key: string,
  { limit, windowMs }: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  const refillPerMs = limit / windowMs;
  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, { tokens: limit - 1, updatedAt: now });
    evictOldest();
    return {
      limited: false,
      limit,
      remaining: limit - 1,
      retryAfterSeconds: 0,
    };
  }

  const elapsed = Math.max(0, now - bucket.updatedAt);
  const tokens = Math.min(limit, bucket.tokens + elapsed * refillPerMs);

  if (tokens < 1) {
    bucket.tokens = tokens;
    bucket.updatedAt = now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((1 - tokens) / refillPerMs / 1000),
    );
    return { limited: true, limit, remaining: 0, retryAfterSeconds };
  }

  bucket.tokens = tokens - 1;
  bucket.updatedAt = now;

  return {
    limited: false,
    limit,
    remaining: Math.floor(bucket.tokens),
    retryAfterSeconds: 0,
  };
}

/** Convenience wrapper so route handlers read like the documented example. */
export function checkRateLimit(
  request: Request,
  rule: RateLimitRule,
  scope: string,
): RateLimitResult {
  return consume(`${scope}:${getClientIp(request)}`, rule);
}

/** Test/ops helper — clears all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
