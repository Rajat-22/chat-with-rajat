"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  /** Stable identity — never use the array index as a key or selector (P1-09). */
  id: string;
  role: "user" | "ai";
  text: string;
}

const createMessage = (role: Message["role"], text: string): Message => ({
  id: crypto.randomUUID(),
  role,
  text,
});

const WELCOME_MESSAGE =
  "👋 Hi! I'm Rajat's AI portfolio assistant.\n\nAsk me anything about his work at **Bold Technology** or **Sopra Steria**, his featured **projects**, **skills**, or how to get in touch!";

const RESET_MESSAGE =
  "👋 Chat reset! Ask me anything about Rajat's skills, experience, or projects.";

const SUGGESTED_QUESTIONS = [
  "🏢 Role at Bold Technology",
  "💼 Experience at Sopra Steria",
  "🚀 Top projects & live demos",
  "🛠️ Core tech stack",
  "🤝 Leave a message / Hire Rajat",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    createMessage("ai", WELCOME_MESSAGE),
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // P1-07: the "thinking" indicator is driven by this flag, not by inspecting
  // message text — the empty AI placeholder made the old text check useless.
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // P2-21: the scrollable feed element, used to detect whether the reader is
  // already at the bottom before auto-scrolling.
  const scrollContainerRef = useRef<HTMLElement>(null);
  // P1-16: keep the timer id so it can be cleared on unmount / on re-copy.
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P2-21: one scroll per animation frame instead of one per streamed chunk.
  const scrollFrameRef = useRef<number | null>(null);

  // P1-16: clear the pending copy timer and any queued scroll frame on unmount,
  // so React never sees a state update after the component is gone.
  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) clearTimeout(copyResetTimeoutRef.current);
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  /**
   * P2-21: a smooth scroll on every streamed chunk restarts the animation
   * dozens of times per answer. Instead:
   *   - only scroll when the reader is already near the bottom, so someone who
   *     scrolled up to re-read is never yanked back down, and
   *   - coalesce bursts of chunks into a single scroll per animation frame.
   */
  useEffect(() => {
    // P1-16: nothing to scroll on the initial hero render.
    if (messages.length <= 1 && !loading) return;

    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;

      const scroller = scrollContainerRef.current;
      const nearBottom =
        !scroller ||
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;

      if (nearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }, [messages, loading]);

  const handleLeadSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!leadEmail.trim() || leadSubmitting) return;

    setLeadSubmitting(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail,
          name: leadName,
          message: leadMessage,
        }),
      });

      if (!res.ok) {
        // Surface the server's own message — it distinguishes a rate limit
        // (429) from a delivery failure (503) and points at the direct email.
        let serverMessage = "Failed to send note";
        try {
          const errData = await res.json();
          serverMessage = errData.error || serverMessage;
        } catch {
          // Non-JSON error response; keep the generic message.
        }
        throw new Error(serverMessage);
      }

      setIsContactModalOpen(false);
      setLeadEmail("");
      setLeadName("");
      setLeadMessage("");

      setMessages((prev) => [
        ...prev,
        createMessage(
          "ai",
          `🎉 **Thank you, ${leadName || "there"}!** Your message has been directly recorded for Rajat. He will review your note and contact you at **${leadEmail}** shortly!`,
        ),
      ]);
    } catch (error) {
      // P3-28 replaces this blocking alert with an inline bubble.
      alert(
        error instanceof Error && error.message
          ? `${error.message}\n\nYou can also reach Rajat directly at rajatsharma221098@gmail.com.`
          : "Could not record note. You can also reach Rajat directly at rajatsharma221098@gmail.com.",
      );
    } finally {
      setLeadSubmitting(false);
    }
  };

  /**
   * P1-09: keyed by message id, so the confirmation can never drift onto the
   * wrong bubble as messages are appended during streaming.
   * P1-16: the previous timer is cleared before starting a new one, and the id
   * is stored so unmount can clear it too.
   */
  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);

      if (copyResetTimeoutRef.current) clearTimeout(copyResetTimeoutRef.current);

      setCopiedMessageId(messageId);
      copyResetTimeoutRef.current = setTimeout(() => {
        setCopiedMessageId(null);
        copyResetTimeoutRef.current = null;
      }, 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const sendQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    const userMsg = createMessage("user", queryText);
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    // P1-07: reset before each turn so the thinking state is shown again.
    setHasReceivedFirstChunk(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: queryText,
          history: messages, // Send prior conversation turns (excluding the turn being asked)
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

      // Add placeholder AI message that will receive chunks. It gets a stable id
      // up front so the streaming cursor and copy state can target it by
      // identity rather than by array position (P1-08 / P1-09).
      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "ai", text: "" },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          // P1-07: the first byte is what ends the thinking state.
          setHasReceivedFirstChunk(true);

          setMessages((prev) => {
            const newMsgs = [...prev];
            const lastIdx = newMsgs.length - 1;
            if (lastIdx >= 0 && newMsgs[lastIdx].id === assistantMessageId) {
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                text: newMsgs[lastIdx].text + chunk,
              };
            }
            return newMsgs;
          });
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      const displayMsg =
        err instanceof Error && err.message
          ? err.message
          : "⚠️ Connection interrupted. Please check your network or try again.";

      setMessages((prev) => [...prev, createMessage("ai", displayMsg)]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  const clearChat = () => {
    setMessages([createMessage("ai", RESET_MESSAGE)]);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#070913] text-slate-100 selection:bg-cyan-500 selection:text-white overflow-hidden">
      {/* Dynamic Animated Ambient Orbs Canvas */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-indigo-600/30 via-violet-600/25 to-pink-500/15 blur-[130px] animate-float-slow" />
        <div className="absolute top-1/4 -right-48 w-[650px] h-[650px] rounded-full bg-gradient-to-bl from-cyan-500/25 via-blue-600/20 to-emerald-500/15 blur-[140px] animate-float-reverse" />
        <div className="absolute -bottom-48 left-1/3 w-[550px] h-[550px] rounded-full bg-gradient-to-r from-purple-600/20 via-fuchsia-600/15 to-blue-600/20 blur-[130px] animate-float-pulse" />
        {/* Subtle geometric dot grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000_70%,transparent_100%)] opacity-70" />
      </div>

      {/* Top Navigation Bar - Appears only when conversation starts, disappears on Reset */}
      {messages.length > 1 && (
        <header className="sticky top-0 z-30 w-full backdrop-blur-2xl bg-[#070913]/70 border-b border-white/[0.08] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-lg shadow-black/20 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="relative">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-cyan-400 via-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-blue-500/25 ring-2 ring-white/20">
                R
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-slate-100 text-sm sm:text-base tracking-tight leading-tight">
                  Rajat Sharma
                </h1>
              </div>
              <p className="text-xs text-slate-400 font-normal mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-300 font-medium">Software Developer</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="https://rajatsharma-portfolio.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 transition-all font-medium hover:border-white/20"
            >
              <span>Live Portfolio</span>
              <span className="text-cyan-400 text-xs">↗</span>
            </a>
            <button
              onClick={() => setIsContactModalOpen(true)}
              type="button"
              className="text-xs font-semibold px-3.5 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500 hover:brightness-110 text-white shadow-md shadow-blue-500/25 transition-all cursor-pointer hover:scale-[1.02]"
            >
              Hire / Contact
            </button>
            <button
              onClick={clearChat}
              type="button"
              className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer"
              title="Reset conversation"
            >
              <span className="hidden sm:inline">Reset</span>
              <span className="sm:hidden">↺</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Conversation Stream Area */}
      <main
        ref={scrollContainerRef}
        className={`flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-44 overflow-y-auto z-10 flex flex-col gap-6 ${
          messages.length <= 1 ? "justify-center my-auto" : ""
        }`}
      >
        {/* Welcome Hero & Capability Showcase (Shown when conversation is fresh) */}
        {messages.length <= 1 ? (
          <div className="flex flex-col gap-5 py-4 sm:py-8 animate-in fade-in duration-300">
            {/* Header intro */}
            <div className="text-center sm:text-left space-y-2.5">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-1">
                <a
                  href="https://rajatsharma-portfolio.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all font-medium hover:border-cyan-500/30"
                >
                  <span>Live Portfolio</span>
                  <span className="text-cyan-400 text-xs">↗</span>
                </a>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Chat with Rajat&apos;s AI Assistant
              </h2>
              <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                👋 Hi! I&apos;m Rajat&apos;s personal AI agent. Ask me about his full-stack engineering expertise, work at <strong>Bold Technology</strong> & <strong>Sopra Steria</strong>, or select a topic below to get started.
              </p>
            </div>

            {/* 2x2 Interactive Capability Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
              <button
                type="button"
                onClick={() => sendQuery("🏢 Role at Bold Technology")}
                className="group text-left p-4 sm:p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-blue-500/40 backdrop-blur-xl transition-all cursor-pointer shadow-sm hover:shadow-blue-500/10 hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">🏢</span>
                  <span className="text-slate-500 group-hover:text-cyan-400 text-xs transition-colors">Ask ↗</span>
                </div>
                <h3 className="font-semibold text-sm text-slate-100 group-hover:text-white">
                  Current Role & Experience
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  Software Engineer @ Bold Tech & 4.5+ yrs at Sopra Steria
                </p>
              </button>

              <button
                type="button"
                onClick={() => sendQuery("🚀 Top projects & live demos")}
                className="group text-left p-4 sm:p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-cyan-500/40 backdrop-blur-xl transition-all cursor-pointer shadow-sm hover:shadow-cyan-500/10 hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">🚀</span>
                  <span className="text-slate-500 group-hover:text-cyan-400 text-xs transition-colors">Ask ↗</span>
                </div>
                <h3 className="font-semibold text-sm text-slate-100 group-hover:text-white">
                  Engineering Projects
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  Network Analyzer, Tick-Tock Store, & AI Portfolio
                </p>
              </button>

              <button
                type="button"
                onClick={() => sendQuery("🛠️ Core tech stack")}
                className="group text-left p-4 sm:p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-indigo-500/40 backdrop-blur-xl transition-all cursor-pointer shadow-sm hover:shadow-indigo-500/10 hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">🛠️</span>
                  <span className="text-slate-500 group-hover:text-cyan-400 text-xs transition-colors">Ask ↗</span>
                </div>
                <h3 className="font-semibold text-sm text-slate-100 group-hover:text-white">
                  Technical Stack
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  React, Vue 3, Next.js, TypeScript, D3 & Neo4j
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsContactModalOpen(true)}
                className="group text-left p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-950/30 via-indigo-950/20 to-cyan-950/20 hover:from-blue-900/40 hover:to-indigo-900/30 border border-white/10 hover:border-cyan-400/50 backdrop-blur-xl transition-all cursor-pointer shadow-sm hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">🤝</span>
                  <span className="text-cyan-400 text-xs font-medium">Contact Form ↗</span>
                </div>
                <h3 className="font-semibold text-sm text-slate-100 group-hover:text-white">
                  Hire / Interview
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  Send a note directly to Rajat&apos;s personal inbox
                </p>
              </button>
            </div>
          </div>
        ) : null}

        {/* Message Feed (Render conversational turns once interaction starts) */}
        {messages.slice(messages.length <= 1 ? 1 : 0).map((msg) => {
          if (msg.role === "ai" && !msg.text) return null;

          // P1-08: compare against the real last message by id. The previous
          // check compared an index from the *sliced* array against
          // `messages.length - 1`, so the cursor could never attach correctly.
          const isLatestStreamingMessage =
            loading && msg.id === messages[messages.length - 1]?.id;

          return (
            <div
              key={msg.id}
              className={`group relative flex flex-col w-full ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              {msg.role === "ai" && (
                <div className="flex items-center gap-2 mb-1.5 pl-1 text-xs text-slate-400 font-medium">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-[10px] text-white font-bold">
                    R
                  </div>
                  <span>Rajat&apos;s Assistant</span>
                </div>
              )}

              <div
                className={`p-4 sm:p-5 rounded-3xl text-sm leading-relaxed transition-all ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white rounded-tr-xs shadow-lg shadow-blue-500/20 border border-blue-400/30 max-w-[88%] sm:max-w-[80%] whitespace-pre-wrap"
                    : "bg-white/[0.04] backdrop-blur-2xl text-slate-100 rounded-tl-xs border border-white/[0.09] shadow-xl shadow-black/40 ring-1 ring-white/5 max-w-[94%] sm:max-w-[88%]"
                }`}
              >
                {msg.role === "user" ? (
                  msg.text
                ) : (
                  <div className="prose prose-invert max-w-none text-sm space-y-2.5">
                    <ReactMarkdown
                      components={{
                        a: ({ ...props }) => (
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 underline font-medium transition-colors inline-flex items-center gap-1"
                            {...props}
                          />
                        ),
                        ul: ({ ...props }) => (
                          <ul className="list-disc pl-5 space-y-1.5 my-2 text-slate-200" {...props} />
                        ),
                        ol: ({ ...props }) => (
                          <ol className="list-decimal pl-5 space-y-1.5 my-2 text-slate-200" {...props} />
                        ),
                        li: ({ ...props }) => (
                          <li className="leading-relaxed" {...props} />
                        ),
                        strong: ({ ...props }) => (
                          <strong className="font-semibold text-white tracking-tight" {...props} />
                        ),
                        code: ({ ...props }) => (
                          <code
                            className="bg-slate-950/80 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono border border-white/10"
                            {...props}
                          />
                        ),
                        p: ({ ...props }) => (
                          <p className="mb-2 last:mb-0 leading-relaxed text-slate-200" {...props} />
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                    {isLatestStreamingMessage && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle rounded-xs shadow-[0_0_8px_#22d3ee]" />
                    )}
                  </div>
                )}
              </div>

              {/* 1-Click Copy button for AI replies */}
              {msg.role === "ai" && msg.text && !loading && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(msg.text, msg.id)}
                  className="mt-1.5 text-[11px] text-slate-500 hover:text-cyan-300 transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1 cursor-pointer self-start pl-2"
                >
                  {copiedMessageId === msg.id
                    ? "✓ Copied to clipboard"
                    : "Copy response"}
                </button>
              )}
            </div>
          );
        })}

        {/*
          P1-07: driven by state, not by inspecting message text. The old guard
          looked for a last message with no text — but an empty AI placeholder is
          pushed the moment streaming begins, and that placeholder is also hidden
          during render, so the indicator could never appear.
        */}
        {loading && !hasReceivedFirstChunk && (
          <div className="flex items-center gap-3 text-slate-300 text-xs self-start bg-white/[0.04] backdrop-blur-xl border border-white/10 px-4 py-3 rounded-2xl shadow-lg ring-1 ring-white/5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
            </span>
            Rajat&apos;s AI is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Floating Bottom Dock (Prompt Chips + Input Capsule) */}
      <footer className="fixed bottom-0 inset-x-0 z-30 pointer-events-none pb-4 sm:pb-6 px-4 flex flex-col items-center bg-gradient-to-t from-[#070913] via-[#070913]/90 to-transparent pt-10">
        {/* Quick Suggestion Chips (Shown once conversation starts for follow-up prompts) */}
        {messages.length > 1 && messages.length <= 6 && (
          <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto no-scrollbar max-w-3xl w-full mb-3 px-1 animate-in fade-in duration-200">
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (q.includes("Leave a message")) {
                    setIsContactModalOpen(true);
                  } else {
                    sendQuery(q);
                  }
                }}
                disabled={loading}
                className="whitespace-nowrap text-xs bg-slate-950/70 hover:bg-white/[0.1] backdrop-blur-xl text-slate-300 hover:text-white px-3.5 py-1.5 rounded-full border border-white/10 hover:border-cyan-400/40 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:scale-[1.02]"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input Capsule Bar */}
        <form
          onSubmit={handleFormSubmit}
          className="pointer-events-auto max-w-3xl w-full bg-slate-900/80 backdrop-blur-2xl border border-white/15 focus-within:border-cyan-400/60 focus-within:ring-2 focus-within:ring-cyan-400/20 rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_30px_rgba(59,130,246,0.15)] p-2 sm:p-2.5 flex items-center gap-2 transition-all"
        >
          <input
            type="text"
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about Rajat's experience, tech stack, projects..."
            disabled={loading}
            className="flex-1 px-4 py-2 sm:py-2.5 bg-transparent border-0 outline-none text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-500 text-white text-xs sm:text-sm font-semibold px-5 py-2.5 sm:py-2.5 rounded-xl sm:rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-blue-500/25 hover:shadow-cyan-500/35 hover:scale-[1.02] shrink-0"
          >
            Send
          </button>
        </form>

        {/* Footer caption */}
        <p className="pointer-events-auto text-[10px] text-slate-500 mt-2 text-center">
          Grounded on verified portfolio data
        </p>
      </footer>

      {/* Recruiter / Visitor Contact Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl relative ring-1 ring-white/10">
            <button
              onClick={() => setIsContactModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors text-lg cursor-pointer"
            >
              ✕
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/30">
                ✉️
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-base">
                  Contact / Hire Rajat
                </h3>
                <p className="text-xs text-slate-400">
                  Leave a note and Rajat will receive it immediately
                </p>
              </div>
            </div>

            <form onSubmit={handleLeadSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins (Tech Recruiter)"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Your Email <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Note / Opportunity Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Tell Rajat about your role, team, or opportunity..."
                  value={leadMessage}
                  onChange={(e) => setLeadMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20 resize-none"
                />
              </div>

              <div className="flex gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.05] hover:bg-white/[0.09] text-slate-300 text-sm font-medium rounded-xl border border-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={leadSubmitting || !leadEmail.trim()}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:brightness-110 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-blue-500/25"
                >
                  {leadSubmitting ? "Sending..." : "Send to Rajat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
