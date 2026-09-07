'use client';
import { useState } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([{ role: 'ai', text: 'Hi! I am the AI assistant for Rajat. Ask me anything about his skills, projects, or experience.' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'ai', text: data.reply }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Oops! Something went wrong.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md flex flex-col h-[600px]">
        <div className="p-4 bg-blue-600 text-white font-bold rounded-t-lg">
          Chat with Rajat's AI
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          {messages.map((msg, index) => (
            <div key={index} className={`p-3 rounded-lg max-w-[80%] ${msg.role === 'user' ? 'bg-blue-100 self-end text-blue-900' : 'bg-gray-100 self-start text-gray-800'}`}>
              {msg.text}
            </div>
          ))}
          {loading && <div className="text-gray-500 text-sm self-start">Rajat's AI is typing...</div>}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t flex gap-2">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Ask about Rajat's experience..."
            className="flex-1 p-2 border rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-black"
          />
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}