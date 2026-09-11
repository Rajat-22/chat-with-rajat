import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logInteraction, sendNotification } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'A valid message is required.' },
        { status: 400 }
      );
    }

    // Guardrail: Limit input length to protect quota and prevent prompt abuse
    if (message.length > 600) {
      return NextResponse.json(
        { error: 'Message exceeds the 600-character limit. Please keep your question concise.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_actual_api_key_here' || apiKey.trim() === '') {
      const fallbackMsg = "⚠️ **Gemini API Key Required**\n\nI'm ready to chat, but my Gemini API key hasn't been configured yet!\n\n**Quick Setup:**\n1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).\n2. Open `.env.local` in this project.\n3. Replace `your_actual_api_key_here` with your real key:\n   ```dotenv\n   GEMINI_API_KEY=AIzaSy...\n   ```\n4. Restart the dev server (`npm run dev`).";

      // Return as a stream for consistent frontend consumption
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(fallbackMsg));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Read portfolio data as source of truth
    const filePath = path.join(process.cwd(), 'portfolio-data.json');
    let portfolioData = '{}';
    if (fs.existsSync(filePath)) {
      portfolioData = fs.readFileSync(filePath, 'utf8');
    }

    // Auto-detect and save recruiter leads if an email is provided in the message
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      try {
        const leadsDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(leadsDir)) {
          fs.mkdirSync(leadsDir, { recursive: true });
        }
        const leadsFile = path.join(leadsDir, 'leads.json');
        let leads = [];
        if (fs.existsSync(leadsFile)) {
          try {
            leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
          } catch {
            leads = [];
          }
        }
        leads.push({
          timestamp: new Date().toISOString(),
          email: emailMatch[0],
          rawMessage: message,
        });
        fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2), 'utf8');

        // Extract prior user questions to provide full context in notification
        const priorQuestions = Array.isArray(history)
          ? history.filter((h) => h.role === 'user').map((h) => h.text)
          : [];

        // Trigger real-time alert (WhatsApp via CallMeBot and/or Email via Resend)
        sendNotification({
          title: 'Recruiter Contact Detected in Chat!',
          contact: emailMatch[0],
          message,
          recentQuestions: [...priorQuestions, message],
        }).catch((err) => console.error('Notification dispatch failed:', err));
      } catch (leadErr) {
        console.error('Lead auto-save error:', leadErr);
      }
    }

    // Always log the user question for analytics & review
    logInteraction({
      timestamp: new Date().toISOString(),
      userMessage: message,
      recruiterEmail: emailMatch ? emailMatch[0] : undefined,
    });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      systemInstruction: `You are Rajat Sharma's personal AI portfolio assistant.
Your job is to answer questions about Rajat's background, professional experience (Software Engineer at Bold Technology, ex-Senior Software Engineer at Sopra Steria), technical skills, projects, and contact info.
Use this JSON data as your primary source of truth:
${portfolioData}

Guidelines:
- Represent Rajat professionally, warmly, and authentically.
- Speak in the third person or first person plural on behalf of Rajat (e.g., "Rajat has experience with...", "He builds...").
- Format responses cleanly with markdown (bullet points, bold text for key technologies, clear sections).
- If the user/recruiter provides an email or contact info, warmly thank them, confirm that their note has been recorded, and reassure them that Rajat will get in touch promptly.
- If the user asks for something not mentioned in the portfolio data, politely state that Rajat hasn't listed that yet, then suggest relevant areas you can answer (e.g., his projects, skills, or contact info).
- Keep replies concise, helpful, and easy to read.`,
    });

    // Format multi-turn conversation history for Gemini's native chat structure
    // Gemini requires strict alternating user/model turns starting with 'user' and ending with 'model'
    const formattedHistory = [];
    if (Array.isArray(history) && history.length > 0) {
      // Exclude empty turns
      const validTurns = history.filter(
        (t) => t.text && typeof t.text === 'string' && t.text.trim()
      );

      // Must start from the first 'user' message
      const firstUserIndex = validTurns.findIndex((t) => t.role === 'user');
      if (firstUserIndex !== -1) {
        const conversationSlice = validTurns.slice(firstUserIndex).slice(-10);

        for (const item of conversationSlice) {
          const role = item.role === 'user' ? 'user' : 'model';
          // Avoid duplicate consecutive roles by merging texts
          if (
            formattedHistory.length > 0 &&
            formattedHistory[formattedHistory.length - 1].role === role
          ) {
            formattedHistory[formattedHistory.length - 1].parts[0].text += `\n${item.text}`;
          } else {
            formattedHistory.push({
              role,
              parts: [{ text: item.text }],
            });
          }
        }

        // CRITICAL FIX: A chat session's history BEFORE calling sendMessageStream(message)
        // MUST end with a 'model' turn because the new message being sent is the next 'user' turn.
        // If history ends with 'user', pop it so Gemini doesn't reject it as consecutive user turns.
        while (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
          formattedHistory.pop();
        }
      }
    }

    // Start native Gemini multi-turn chat session with sanitized history
    const chatSession = model.startChat({
      history: formattedHistory,
    });

    const resultStream = await chatSession.sendMessageStream(message);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              controller.enqueue(encoder.encode(chunkText));
            }
          }
          controller.close();
        } catch (streamErr) {
          console.error('Stream generation error:', streamErr);
          const errMsg = streamErr instanceof Error ? streamErr.message : 'Error streaming response';
          controller.enqueue(encoder.encode(`\n\n⚠️ *[Generation issue: ${errMsg}]*`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Handle common Gemini error codes gracefully
    let userFriendlyError = `Failed to generate response: ${message}`;
    if (message.includes('429') || message.toLowerCase().includes('quota')) {
      userFriendlyError = "⚠️ Gemini API rate limit reached. Please wait a moment and try again.";
    } else if (message.toLowerCase().includes('api_key') || message.toLowerCase().includes('apikey')) {
      userFriendlyError = "⚠️ Invalid Gemini API key. Please check your key in `.env.local`.";
    }

    return NextResponse.json(
      { error: userFriendlyError },
      { status: 500 }
    );
  }
}

