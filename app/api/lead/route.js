import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { sendNotification } from "@/lib/notify";

export async function POST(req) {
  try {
    const { email, name, message } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 },
      );
    }

    const lead = {
      timestamp: new Date().toISOString(),
      email: email.trim(),
      name: (name || "Recruiter/Visitor").trim(),
      message: (message || "").trim(),
    };

    // Save lead to local JSON file
    const leadsDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(leadsDir)) {
      fs.mkdirSync(leadsDir, { recursive: true });
    }

    const leadsFile = path.join(leadsDir, "leads.json");
    let leads = [];
    if (fs.existsSync(leadsFile)) {
      try {
        leads = JSON.parse(fs.readFileSync(leadsFile, "utf8"));
      } catch {
        leads = [];
      }
    }

    leads.push(lead);
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2), "utf8");

    // Trigger notification (WhatsApp via CallMeBot and/or Email via Resend)
    await sendNotification({
      title: "New Recruiter Lead on Chat with Rajat!",
      contact: `${lead.name} <${lead.email}>`,
      message: lead.message || "Opportunity note left via Contact modal",
    });

    return NextResponse.json({
      success: true,
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
