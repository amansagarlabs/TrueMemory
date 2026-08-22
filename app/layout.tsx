import type { Metadata } from "next";
import { GeistPixelGrid } from "geist/font/pixel";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AgentNavigationDock } from "@/components/agent-navigation-dock";
import { ThemeSync } from "@/components/theme-sync";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geist = GeistSans;
const geistMono = GeistMono;
const themeInitScript = `
  (() => {
    try {
      const storedTheme = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = storedTheme ? storedTheme === "dark" : prefersDark;
      const root = document.documentElement;
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    } catch {}
  })();
`;

export const metadata: Metadata = {
  title: "Aman Agent Lab | AI Agent Workspace",
  description:
    "Aman Agent Lab is an AI agent workspace for chat, documents, memory, and automation with a polished Magic UI inspired landing page.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
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
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${GeistPixelGrid.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeSync />
        <AgentNavigationDock />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
