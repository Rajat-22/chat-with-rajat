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
 * Send real-time notification across configured channels (WhatsApp, Email, Webhook)
 */
export async function sendNotification({
  title,
  message,
  contact,
  recentQuestions = [],
}: {
  title: string;
  message: string;
  contact?: string;
  recentQuestions?: string[];
}) {
  const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // 1. WhatsApp Notification via CallMeBot (Free, instant personal WhatsApp notification)
  const waPhone = process.env.WHATSAPP_PHONE; // e.g. 919873957498
  const waApiKey = process.env.WHATSAPP_API_KEY; // Free key from callmebot
  if (waPhone && waApiKey) {
    try {
      const waText = encodeURIComponent(
        `🚨 *${title}*\n\n👤 *From:* ${contact || "Anonymous Visitor"}\n📝 *Note:* ${message}\n⏰ *Time:* ${time}${
          recentQuestions.length
            ? `\n\n❓ *Questions asked:*\n${recentQuestions.map((q) => `• ${q}`).join("\n")}`
            : ""
        }`,
      );
      const waUrl = `https://api.callmebot.com/whatsapp.php?phone=${waPhone}&text=${waText}&apikey=${waApiKey}`;
      await fetch(waUrl, { method: "GET" });
    } catch (waErr) {
      console.error("WhatsApp notification error:", waErr);
    }
  }

  // 2. Email Notification via Resend (Free 100 emails/day)
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail =
    process.env.NOTIFICATION_EMAIL || "rajatsharma221098@gmail.com";
  if (resendApiKey && resendApiKey !== "your_resend_api_key_here") {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Chat with Rajat <onboarding@resend.dev>",
          to: [notifyEmail],
          subject: `📬 ${title}: ${contact || "Visitor Interaction"}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #2563eb; margin-top: 0;">${title}</h2>
              <p><strong>Contact:</strong> ${contact || "Not provided"}</p>
              <p><strong>Message / Opportunity:</strong> ${message}</p>
              <p><strong>Time:</strong> ${time}</p>
              ${
                recentQuestions.length
                  ? `<h3>Questions Asked in Chat:</h3><ul>${recentQuestions
                      .map((q) => `<li>${q}</li>`)
                      .join("")}</ul>`
                  : ""
              }
            </div>
          `,
        }),
      });
    } catch (emailErr) {
      console.error("Email notification error:", emailErr);
    }
  }
}
