import fs from "fs";
import path from "path";

export interface ChatInteraction {
  timestamp: string;
  userMessage: string;
  replySnippet?: string;
  recruiterEmail?: string;
}

/**
 * Log all user interactions into data/conversations.json
 */
export function logInteraction(entry: ChatInteraction) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const convFile = path.join(dataDir, "conversations.json");
    let conversations: ChatInteraction[] = [];
    if (fs.existsSync(convFile)) {
      try {
        conversations = JSON.parse(fs.readFileSync(convFile, "utf8"));
      } catch {
        conversations = [];
      }
    }

    conversations.push(entry);
    // Keep last 500 interactions to prevent unbounded file size
    if (conversations.length > 500) {
      conversations = conversations.slice(-500);
    }
    fs.writeFileSync(convFile, JSON.stringify(conversations, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to log interaction:", err);
  }
}

/**
 * Escapes a value for safe interpolation into the notification HTML template.
 * Without this, a visitor typing `<img src=x onerror=...>` into the note field
 * injects markup straight into Rajat's inbox email (P0-03).
 */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapses whitespace and truncates, so oversized input cannot bloat the email. */
function clamp(value: unknown, maxLength: number): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export interface NotificationPayload {
  title: string;
  message: string;
  contact?: string;
  recentQuestions?: string[];
}

export interface NotificationResult {
  ok: boolean;
  channel?: "email";
  error?: string;
}

/**
 * Sends a notification across the configured channels (Email via Resend) and
 * reports whether any channel succeeded, so routes can fail loudly instead of
 * thanking a recruiter for a note that was thrown away (P0-02).
 */
export async function sendNotification({
  title,
  message,
  contact,
  recentQuestions = [],
}: NotificationPayload): Promise<NotificationResult> {
  const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail =
    process.env.NOTIFICATION_EMAIL || "rajatsharma221098@gmail.com";

  if (!resendApiKey || resendApiKey === "your_resend_api_key_here") {
    return {
      ok: false,
      error:
        "Email notifications are not configured (RESEND_API_KEY is missing).",
    };
  }

  // Clamp first, then escape — every interpolated value is untrusted input.
  const safeTitle = escapeHtml(clamp(title, 200));
  const safeContact = escapeHtml(clamp(contact, 300)) || "Not provided";
  const safeMessage = escapeHtml(clamp(message, 2000));
  const safeQuestions = recentQuestions
    .slice(0, 10)
    .map((question) => escapeHtml(clamp(question, 300)))
    .filter(Boolean);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Chat with Rajat <onboarding@resend.dev>",
        to: [notifyEmail],
        subject: `📬 ${safeTitle}: ${safeContact}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #2563eb; margin-top: 0;">${safeTitle}</h2>
              <p><strong>Contact:</strong> ${safeContact}</p>
              <p><strong>Message / Opportunity:</strong> ${safeMessage || "Not provided"}</p>
              <p><strong>Time:</strong> ${escapeHtml(time)}</p>
              ${
                safeQuestions.length
                  ? `<h3>Questions Asked in Chat:</h3><ul>${safeQuestions
                      .map((question) => `<li>${question}</li>`)
                      .join("")}</ul>`
                  : ""
              }
            </div>
          `,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Resend responded ${response.status}${
        detail ? `: ${detail.slice(0, 300)}` : ""
      }`;
      console.error("Email notification error:", error);
      return { ok: false, channel: "email", error };
    }

    return { ok: true, channel: "email" };
  } catch (emailErr) {
    const error =
      emailErr instanceof Error ? emailErr.message : "Unknown email error";
    console.error("Email notification error:", error);
    return { ok: false, channel: "email", error };
  }
}
