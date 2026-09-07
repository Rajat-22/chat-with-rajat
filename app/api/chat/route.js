import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { message } = await req.json();
    
    // Read your portfolio data
    const filePath = path.join(process.cwd(), 'portfolio-data.json');
    const portfolioData = fs.readFileSync(filePath, 'utf8');

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      You are an AI assistant representing Rajat, a Full-Stack Developer. 
      Use ONLY this JSON data to answer the user: ${portfolioData}
      If the answer is not in the data, politely say you don't have that information.
      Be conversational, concise, and professional.
      
      User asked: ${message}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    return NextResponse.json({ reply: responseText });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}