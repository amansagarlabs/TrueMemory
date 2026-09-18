"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { isAuthenticated } from "@/lib/auth";
import { fetchAgentSkills, type AgentSkill } from "@/services/agent-skills";

export default function SkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login?redirect=/skills");
      return;
    }
    void fetchAgentSkills().then(setSkills).catch((err) => {
      setError(err instanceof Error ? err.message : "Skills could not be loaded");
    });
  }, [router]);

  return (
    <AuthenticatedAppShell>
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">TrueMemory</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Skills</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage the skills available to your memory workspace.</p>
        {error ? <p className="mt-8 rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p> : null}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {skills.map((skill) => (
            <article key={skill.name} className="rounded-xl border p-5">
              <h2 className="font-medium">{skill.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{skill.description}</p>
            </article>
          ))}
        </div>
        {!error && skills.length === 0 ? <p className="mt-8 text-sm text-muted-foreground">No skills are available yet.</p> : null}
      </main>
    </AuthenticatedAppShell>
  );
}
