"use client";

import ChatInterface from "@/components/chat/ChatInterface";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";

export default function ChatPage() {
  return (
    <AuthenticatedAppShell variant="chat">
      <div className="chat-assistant-page relative h-full overflow-hidden bg-[var(--chat-background)]">
        <main className="relative mx-auto h-full min-h-0 w-full max-w-[1180px]">
          <ChatInterface />
        </main>
      </div>
    </AuthenticatedAppShell>
  );
}
