import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://chat-with-rajat.vercel.app"),
  title: "Chat with Rajat Sharma | AI Portfolio Assistant",
  description:
    "Interactive conversational AI assistant representing Rajat Sharma — Software Engineer at Bold Technology (ex-Sopra Steria). Explore projects, tech stack, and career experience in real time.",
  keywords: [
    "Rajat Sharma",
    "Portfolio",
    "Full-Stack Developer",
    "Software Engineer",
    "Next.js",
    "React",
    "Vue.js",
    "Gemini AI",
    "AI Portfolio",
  ],
  authors: [{ name: "Rajat Sharma", url: "https://rajatsharma-portfolio.vercel.app/" }],
  creator: "Rajat Sharma",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://chat-with-rajat.vercel.app",
    title: "Chat with Rajat Sharma | AI Portfolio Assistant",
    description:
      "Interactive conversational AI assistant representing Rajat Sharma. Ask questions about his background, projects, and skills in real time.",
    siteName: "Chat with Rajat",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chat with Rajat Sharma | AI Portfolio Assistant",
    description:
      "Chat in real time with Rajat Sharma's AI portfolio assistant powered by Gemini and Next.js.",
    creator: "@rajatsharma",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
