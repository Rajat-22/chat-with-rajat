"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "ai";
  text: string;
}

const SUGGESTED_QUESTIONS = [
  "🏢 Tell me about your role at Bold Technology",
  "💼 What did you do at Sopra Steria?",
  "🚀 Show me your top projects & demos",
  "🛠️ What is your core tech stack?",
  "📫 How can I contact Rajat?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: "👋 Hi! I'm Rajat's AI portfolio assistant.\n\nAsk me anything about his work at **Bold Technology** or **Sopra Steria**, his featured **projects**, **skills**, or how to get in touch!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const copyToClipboard = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const sendQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    const userMsg: Message = { role: "user", text: queryText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: queryText,
          history: updatedMessages,
        }),
      });

      if (!res.ok) {
        let errMessage = "Request failed";
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch {
          // ignore json parse error on non-json error responses
        }
        throw new Error(errMessage);
      }

      if (!res.body) {
        throw new Error("No response body received");
      }

      // Add placeholder AI message that will receive chunks
      setMessages((prev) => [...prev, { role: "ai", text: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        setMessages((prev) => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (lastIdx >= 0 && newMsgs[lastIdx].role === "ai") {
            newMsgs[lastIdx] = { ...newMsgs[lastIdx], text: accumulatedText };
          }
          return newMsgs;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "⚠️ Something went wrong connecting to the assistant. Please check your Gemini API key in `.env.local`.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  const clearChat = () => {
    setMessages([
      {
        role: "ai",
        text: "👋 Chat reset! Ask me anything about Rajat's skills, experience, or projects.",
      },
    ]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-3 md:p-6 text-slate-100">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col h-[700px] overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center font-bold text-white text-base shadow-md">
                R
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-slate-100 text-sm md:text-base leading-tight">
                  Chat with Rajat&apos;s AI
                </h1>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 font-medium px-2 py-0.5 rounded-full border border-blue-500/30">
                  Online
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Software Engineer • Powered by Gemini 1.5
              </p>
            </div>
          </div>
          <button
            onClick={clearChat}
            type="button"
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700 transition-colors cursor-pointer"
            title="Reset conversation"
          >
            Clear Chat
          </button>
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col gap-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`group relative flex flex-col max-w-[88%] md:max-w-[80%] ${
                msg.role === "user" ? "self-end items-end" : "self-start items-start"
              }`}
            >
              <div
                className={`p-3.5 md:p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-xs shadow-md whitespace-pre-wrap"
                    : "bg-slate-800/90 text-slate-200 rounded-bl-xs border border-slate-700/70 shadow-sm"
                }`}
              >
                {msg.role === "user" ? (
                  msg.text
                ) : (
                  <div className="prose prose-invert max-w-none text-sm space-y-2">
                    <ReactMarkdown
                      components={{
                        a: ({ ...props }) => (
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline font-medium transition-colors"
                            {...props}
                          />
                        ),
                        ul: ({ ...props }) => (
                          <ul className="list-disc pl-5 space-y-1 my-1.5" {...props} />
                        ),
                        ol: ({ ...props }) => (
                          <ol className="list-decimal pl-5 space-y-1 my-1.5" {...props} />
                        ),
                        li: ({ ...props }) => (
                          <li className="leading-relaxed" {...props} />
                        ),
                        strong: ({ ...props }) => (
                          <strong className="font-semibold text-white" {...props} />
                        ),
                        code: ({ ...props }) => (
                          <code
                            className="bg-slate-950 text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-800"
                            {...props}
                          />
                        ),
                        p: ({ ...props }) => (
                          <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Copy message button for AI replies */}
              {msg.role === "ai" && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(msg.text, index)}
                  className="mt-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1 cursor-pointer self-start pl-1"
                >
                  {copiedIndex === index ? "✓ Copied" : "Copy text"}
                </button>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2.5 text-slate-400 text-xs self-start bg-slate-800/80 border border-slate-700/60 px-3.5 py-2.5 rounded-2xl shadow-sm">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              Rajat&apos;s AI is thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Question Chips */}
        {messages.length <= 4 && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendQuery(q)}
                disabled={loading}
                className="whitespace-nowrap text-xs bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white px-3 py-1.5 rounded-full border border-slate-700/80 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleFormSubmit} className="p-3.5 border-t border-slate-800 bg-slate-900/90 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Rajat's experience, skills, or projects..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer shadow-sm hover:shadow"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
