import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Chat with Rajat Sharma - AI Portfolio Assistant";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#020617",
        backgroundImage:
          "radial-gradient(circle at 25px 25px, #1e293b 2%, transparent 0%), radial-gradient(circle at 75px 75px, #1e293b 2%, transparent 0%)",
        backgroundSize: "100px 100px",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        padding: "60px",
      }}
    >
      {/* Glow pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          border: "1px solid rgba(59, 130, 246, 0.4)",
          borderRadius: "9999px",
          padding: "10px 24px",
          marginBottom: "28px",
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: "#10b981",
          }}
        />
        <span style={{ fontSize: "20px", color: "#60a5fa", fontWeight: 600 }}>
          Powered by Gemini 1.5 & Next.js 16
        </span>
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: "64px",
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.1,
          margin: "0 0 20px 0",
          background: "linear-gradient(to right, #ffffff, #93c5fd, #60a5fa)",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Chat with Rajat&apos;s AI
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: "26px",
          color: "#94a3b8",
          textAlign: "center",
          maxWidth: "900px",
          margin: "0 0 40px 0",
          lineHeight: 1.4,
        }}
      >
        Interactive conversational AI portfolio • Software Engineer at Bold
        Technology (ex-Sopra Steria)
      </p>

      {/* Tech badges */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {[
          "React & Next.js",
          "Vue 3",
          "TypeScript",
          "Tailwind CSS",
          "Data Visualizations",
          "Generative AI",
        ].map((tag, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              padding: "10px 20px",
              fontSize: "18px",
              color: "#e2e8f0",
              fontWeight: 500,
            }}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
    },
  );
}
