import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistPixelGrid } from "geist/font/pixel";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { AgentNavigationDock } from "@/components/agent-navigation-dock";
import { ThemeSync } from "@/components/theme-sync";
import { ThemeInit } from "@/components/theme-init";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistMono = GeistMono;
const stackSansText = localFont({
  src: "../public/fonts/stack-sans/StackSansText-wght.woff2",
  variable: "--font-stack-sans-text",
  display: "swap",
  weight: "200 800",
  style: "normal",
});
const stackSansHeadline = localFont({
  src: "../public/fonts/stack-sans/StackSansHeadline-wght.woff2",
  variable: "--font-stack-sans-headline",
  display: "swap",
  weight: "200 800",
  style: "normal",
});
const stackSansNotch = localFont({
  src: "../public/fonts/stack-sans/StackSansNotch-wght.woff2",
  variable: "--font-stack-sans-notch",
  display: "swap",
  weight: "200 800",
  style: "normal",
});
export const metadata: Metadata = {
  title: "TrueMemory | Universal AI Memory",
  description:
    "TrueMemory is universal AI memory infrastructure for agents, apps, sessions, models, workspaces, and devices.",
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
      className={`${stackSansText.variable} ${stackSansHeadline.variable} ${stackSansNotch.variable} ${geistMono.variable} ${GeistPixelGrid.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeInit />
        <ThemeSync />
        <AgentNavigationDock />
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
