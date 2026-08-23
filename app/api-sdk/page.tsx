"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Copy, Check, Code2, Braces, Terminal, Radio } from "lucide-react";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const examples = {
  REST: `curl -X POST ${API_URL}/v1/memories \\
  -H "Authorization: Bearer $TRUEMEMORY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"key":"preferred_editor","content":"I use VS Code","source":"app","scope":"general"}'`,
  TypeScript: `const memory = await client.remember({
  key: "preferred_editor",
  content: "I use VS Code",
  source: "app",
});

const results = await client.search({ query: "editor" });
const context = await client.retrieve({ query: "what tools do I use?" });`,
  Python: `memory = client.remember(
    key="preferred_editor",
    content="I use VS Code",
    source="app",
)
results = client.search(query="editor")
context = client.retrieve(query="what tools do I use?")`,
  MCP: `{
  "mcpServers": {
    "truememory": {
      "url": "${API_URL}/mcp",
      "headers": {
        "Authorization": "Bearer $TRUEMEMORY_TOKEN"
      }
    }
  }
}`,
} as const;

type ExampleKey = keyof typeof examples;

const developerSurfaces = [
  { title: "REST API", detail: "POST /v1/memories", icon: Code2 },
  { title: "TypeScript", detail: "remember · search · retrieve", icon: Braces },
  { title: "Python", detail: "remember · search · retrieve", icon: Terminal },
  { title: "MCP", detail: "POST /mcp", icon: Radio },
] as const;

export default function ApiSdkPage() {
  const [active, setActive] = useState<ExampleKey>("REST");
  const [copied, setCopied] = useState(false);
  const [tokenName, setTokenName] = useState("my-agent");
  const [token, setToken] = useState<{ id: string; value: string; name: string } | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const code = useMemo(() => examples[active], [active]);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function issueToken(event: FormEvent) {
    event.preventDefault();
    setIssuing(true);
    setTokenError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/api-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({ name: tokenName.trim() || "my-agent", scopes: ["memory"], expires_days: 90 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail?.message || data.detail || "Token could not be issued.");
      setToken({ id: data.token_id || data.id, value: data.token || data.value, name: tokenName.trim() || "my-agent" });
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Token could not be issued.");
    } finally {
      setIssuing(false);
    }
  }

  async function revokeToken() {
    if (!token) return;
    await fetch(`${API_URL}/api/auth/api-tokens/${encodeURIComponent(token.id)}`, { method: "DELETE", headers: buildAuthHeaders() });
    setToken(null);
  }

  return (
    <AuthenticatedAppShell>
      <main className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10">
          <header className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">TrueMemory / API &amp; SDK</p>
            <h1 className="mt-3 font-heading text-4xl tracking-[-.055em] sm:text-5xl">Build on one memory layer.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/45">Use the REST API, TypeScript SDK, Python SDK, or MCP to store and retrieve scoped memory across agents, applications, and sessions.</p>
          </header>

          <section className="mt-7 grid gap-3 md:grid-cols-4">
            {developerSurfaces.map(({ title, detail, icon: Icon }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-[#10100f] p-4">
                <Icon className="size-4 text-[#f6e879]" aria-hidden="true" />
                <p className="mt-4 text-sm font-semibold text-white/80">{title}</p>
                <p className="mt-1 text-xs text-white/35">{detail}</p>
              </div>
            ))}
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#10100f]">
            <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-2">
              {(Object.keys(examples) as ExampleKey[]).map((key) => (
                <button key={key} type="button" onClick={() => setActive(key)} aria-pressed={active === key} className={`min-h-10 rounded-xl px-4 text-xs font-semibold ${active === key ? "bg-[#f6e879] text-[#171814]" : "text-white/45 hover:bg-white/[.05] hover:text-white"}`}>{key}</button>
              ))}
              <button type="button" onClick={() => void copyCode()} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs text-white/45 hover:bg-white/[.05] hover:text-white" aria-label="Copy example">{copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}</button>
            </div>
            <pre className="overflow-x-auto p-5 text-xs leading-6 text-[#d8d8c8]"><code>{code}</code></pre>
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-[#10100f] p-5 lg:col-span-2">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">API credentials</p>
              <h2 className="mt-2 text-xl font-semibold text-white/80">Create a scoped memory token</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">The token is shown once. It is limited to the memory scope and expires in 90 days. Never commit it or expose it in browser source.</p>
              <form onSubmit={issueToken} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="token-name">Token name</label>
                <input id="token-name" value={tokenName} onChange={(event) => setTokenName(event.target.value)} maxLength={120} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f6e879]/50" />
                <button type="submit" disabled={issuing} className="min-h-11 rounded-xl bg-[#f6e879] px-4 text-sm font-semibold text-[#171814] disabled:opacity-50">{issuing ? "Creating…" : "Create token"}</button>
              </form>
              {tokenError ? <p role="alert" className="mt-3 text-sm text-red-300">{tokenError}</p> : null}
              {token ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-4"><p className="text-xs font-semibold text-emerald-200">{token.name} — copy it now</p><code className="mt-2 block break-all text-xs text-white/75">{token.value}</code><div className="mt-3 flex gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(token.value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">Copy token</button><button type="button" onClick={() => void revokeToken()} className="rounded-lg border border-red-300/20 px-3 py-2 text-xs text-red-200">Revoke</button></div></div> : null}
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#10100f] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Available endpoints</p>
              <ul className="mt-4 space-y-3 text-sm text-white/65">
                <li><code className="text-[#f6e879]">GET /v1/memories</code> — list scoped memories</li>
                <li><code className="text-[#f6e879]">POST /v1/memories/search</code> — search memory</li>
                <li><code className="text-[#f6e879]">POST /v1/memories/retrieve</code> — retrieve context</li>
                <li><code className="text-[#f6e879]">POST /mcp</code> — MCP JSON-RPC endpoint</li>
              </ul>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#10100f] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Security boundary</p>
              <p className="mt-4 text-sm leading-6 text-white/60">Use a scoped API token with the <code className="text-[#f6e879]">memory</code> scope. Bind credentials to a Space or agent when needed. Tokens are never embedded in client-side source.</p>
              <p className="mt-3 text-xs leading-5 text-white/35">Token issuance and revocation remain managed by the authenticated account API.</p>
            </section>
          </div>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}
