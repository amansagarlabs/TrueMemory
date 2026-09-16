"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchMe } from "@/services/auth";
import { saveAuthUser } from "@/lib/auth";

function OAuthCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = params.get("next") || "/chat";
    void fetchMe()
      .then(({ user }) => {
        saveAuthUser(user);
        router.replace(next);
      })
      .catch(() => router.replace("/login?oauth=error"));
  }, [params, router]);

  return <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Completing sign-in…</main>;
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Completing sign-in…</main>}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
