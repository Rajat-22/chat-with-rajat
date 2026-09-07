import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'A valid message is required.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_actual_api_key_here' || apiKey.trim() === '') {
      return NextResponse.json({
        reply: "⚠️ **Gemini API Key Required**\n\nI'm ready to chat, but my Gemini API key hasn't been configured yet!\n\n**Quick Setup:**\n1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).\n2. Open `.env.local` in this project.\n3. Replace `your_actual_api_key_here` with your real key:\n   ```dotenv\n   GEMINI_API_KEY=AIzaSy...\n   ```\n4. Restart the dev server (`npm run dev`).",
      });
    }

    // Read your portfolio data
    const filePath = path.join(process.cwd(), 'portfolio-data.json');
    let portfolioData = '{}';
    if (fs.existsSync(filePath)) {
      portfolioData = fs.readFileSync(filePath, 'utf8');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are Rajat's personal AI portfolio assistant.
Your job is to answer questions about Rajat's background, technical skills, projects, experience, and contact information.
Use this JSON data as your primary source of truth:
${portfolioData}

Guidelines:
- Represent Rajat professionally, warmly, and authentically.
- Speak in the third person or first person plural on behalf of Rajat (e.g., "Rajat has experience with...", "He builds...").
- Format responses cleanly with markdown (bullet points, bold text for key technologies, clear sections).
- If the user asks for something not mentioned in the portfolio data, be honest and say Rajat hasn't listed that yet, then suggest relevant areas you can answer (e.g., his projects, skills, or contact info).
- Keep replies concise, helpful, and easy to read.`,
    });

    let prompt = message;
    if (Array.isArray(history) && history.length > 0) {
      const recentTurns = history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n');
      prompt = `${recentTurns}\nUser: ${message}\nAssistant:`;
    }

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    return NextResponse.json({ reply: responseText });
  } catch (error) {
    console.error('Chat API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate response: ${message}` },
      { status: 500 }
    );
  }
}
