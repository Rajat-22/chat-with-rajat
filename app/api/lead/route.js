import { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notify";
import { saveLead } from "@/lib/store";
import { checkRateLimit, LEAD_RATE_LIMIT } from "@/lib/rate-limit";

// Mirrors the chat route's guards so the endpoint is not a free-form sink.
const MAX_BODY_BYTES = 8 * 1024;
const MAX_NAME_CHARS = 100;
const MAX_MESSAGE_CHARS = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req) {
  try {
    // P0-04: this endpoint sends an email, so it is rate limited per IP.
    const rateLimit = checkRateLimit(req, LEAD_RATE_LIMIT, "lead");
    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error:
            "Too many notes sent from this network. Please wait a few minutes and try again.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        },
      );
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 400 },
      );
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Payload too large. Please keep your note under 8 KB." },
        { status: 400 },
      );
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const { email, name, message } = payload ?? {};

    // Validate the trimmed value — otherwise "   " trims to an empty address
    // that is still stored and emailed.
    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 },
      );
    }

    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedMessage = typeof message === "string" ? message.trim() : "";

    if (trimmedName.length > MAX_NAME_CHARS) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME_CHARS} characters or fewer.` },
        { status: 400 },
      );
    }

    if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Note must be ${MAX_MESSAGE_CHARS} characters or fewer.` },
        { status: 400 },
      );
    }

    const lead = {
      timestamp: new Date().toISOString(),
      email: trimmedEmail,
      name: trimmedName || "Recruiter/Visitor",
      message: trimmedMessage,
    };

    // P0-01: write to the durable store. In production without a configured
    // store this fails loudly instead of silently dropping the lead.
    const persisted = await saveLead(lead);
    if (!persisted.ok) {
      console.error("Lead persistence failed:", persisted.error);
      return NextResponse.json(
        {
          error:
            "Could not record your note right now. Please email Rajat directly at rajatsharma221098@gmail.com.",
        },
        { status: 503 },
      );
    }

    // Trigger notification (Email via Resend) and report the real outcome, so we
    // never thank a recruiter for a note that was silently discarded (P0-02).
    const notification = await sendNotification({
      title: "New Recruiter Lead on Chat with Rajat!",
      contact: `${lead.name} <${lead.email}>`,
      message: lead.message || "Opportunity note left via Contact modal",
    });

    if (!notification.ok) {
      console.error(
        "Lead delivery failed — no notification channel succeeded:",
        notification.error,
      );
      return NextResponse.json(
        {
          error:
            "Could not deliver your note right now. Please email Rajat directly at rajatsharma221098@gmail.com.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      stored: persisted.store,
      channel: notification.channel,
      message:
        "Thank you! Rajat has received your note and will get back to you shortly.",
    });
  } catch (error) {
    console.error("Lead Capture Error:", error);
    return NextResponse.json(
      { error: "Failed to record contact info." },
      { status: 500 },
    );
  }
}
