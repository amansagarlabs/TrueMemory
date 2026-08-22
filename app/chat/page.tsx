"use client";
import ChatInterface from "@/components/chat/ChatInterface";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";

export default function ChatPage() {
  return (
    <AuthenticatedAppShell variant="chat">
      <div className="h-screen overflow-hidden">
        <ChatInterface />
      </div>
    </AuthenticatedAppShell>
  );
}
