"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Globe,
  FileText,
  Map,
  Cpu,
  Activity,
  Terminal,
  Zap,
  Shield,
  Database,
  Clock,
  Check,
} from "lucide-react"

const tools = [
  { id: "search", label: "Search", icon: Search },
  { id: "scrape", label: "Scrape", icon: FileText },
  { id: "map", label: "Map", icon: Map },
  { id: "crawl", label: "Crawl", icon: Globe },
  { id: "extract", label: "Extract", icon: Cpu },
  { id: "monitor", label: "Monitor", icon: Activity },
]

const products = [
  {
    name: "ContextOS",
    description: "Memory, artifacts, and agent workflows that persist across sessions.",
    icon: Database,
    href: "/products/contextos",
  },
  {
    name: "ContextCrawl",
    description: "Search, scrape, map, crawl, extract, and monitor — one API for web intelligence.",
    icon: Globe,
    href: "/products/search",
  },
]

const capabilities = [
  {
    tab: "Search",
    title: "Web search with evidence",
    description: "Get structured results with source URLs, snippets, and relevance scores. Every result is traceable.",
    code: `curl -X POST https://api.amansagar.in/v1/search \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"query": "RAG frameworks 2025", "num_results": 5}'`,
    output: `{
  "results": [
    {
      "title": "LangChain vs LlamaIndex in 2025",
      "url": "https://blog.example.com/rag-2025",
      "snippet": "Both frameworks have matured significantly...",
      "score": 0.94
    }
  ],
  "query": "RAG frameworks 2025",
  "total_results": 5
}`,
  },
  {
    tab: "Scrape",
    title: "Structured extraction from any page",
    description: "JS rendering, LLM-powered extraction, and schema validation. Get clean data, not raw HTML.",
    code: `curl -X POST https://api.amansagar.in/v1/scrape \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"url": "https://example.com/pricing", "format": "markdown"}'`,
    output: `{
  "url": "https://example.com/pricing",
  "title": "Pricing - Example",
  "markdown": "# Pricing\\n\\n## Pro\\n$29/mo\\n...",
  "word_count": 1842,
  "status": 200
}`,
  },
  {
    tab: "Map",
    title: "Discover every URL on a site",
    description: "One call to map an entire domain. Useful for audits, crawl planning, and change monitoring.",
    code: `curl -X POST https://api.amansagar.in/v1/map \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"url": "https://docs.example.com"}'`,
    output: `{
  "url": "https://docs.example.com",
  "links": [
    {"url": "/docs/getting-started", "text": "Getting Started"},
    {"url": "/docs/api", "text": "API Reference"},
    {"url": "/docs/examples", "text": "Examples"}
  ],
  "total_links": 142
}`,
  },
  {
    tab: "Crawl",
    title: "Deep crawl at scale",
    description: "Multi-page crawling with depth control, JS rendering, and clean Markdown output per page.",
    code: `curl -X POST https://api.amansagar.in/v1/crawl \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"url": "https://docs.example.com", "max_pages": 50, "depth": 3}'`,
    output: `{
  "job_id": "crawl_abc123",
  "status": "running",
  "pages_crawled": 0,
  "max_pages": 50,
  "estimated_time": "2m 30s"
}`,
  },
  {
    tab: "Extract",
    title: "Schema-based data extraction",
    description: "Define a JSON schema, get typed data back from any URL. Custom fields, nested objects, arrays.",
    code: `curl -X POST https://api.amansagar.in/v1/extract \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"url": "https://example.com/team", "schema": {"name": "string", "role": "string"}}'`,
    output: `{
  "data": [
    {"name": "Jane Smith", "role": "CTO"},
    {"name": "John Doe", "role": "Lead Engineer"}
  ],
  "url": "https://example.com/team",
  "confidence": 0.97
}`,
  },
  {
    tab: "Monitor",
    title: "Get notified on changes",
    description: "Monitor any page on the web. Get alerts when content changes — pricing, news, job postings.",
    code: `curl -X POST https://api.amansagar.in/v1/monitor \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"url": "https://competitor.com/pricing", "interval": "daily"}'`,
    output: `{
  "monitor_id": "mon_xyz789",
  "url": "https://competitor.com/pricing",
  "interval": "daily",
  "status": "active",
  "next_check": "2026-07-15T00:00:00Z"
}`,
  },
]

const benchmarks = [
  { task: "Web Search", metric: "Accuracy", us: "94.2%", exa: "89.1%", tavily: "87.6%" },
  { task: "Page Scraping", metric: "Success Rate", us: "98.7%", exa: "95.3%", tavily: "93.8%" },
  { task: "Site Mapping", metric: "Coverage", us: "99.1%", exa: "N/A", tavily: "N/A" },
  { task: "Data Extraction", metric: "Schema Accuracy", us: "96.4%", exa: "N/A", tavily: "91.2%" },
]

const logos = [
  "Vercel", "Stripe", "Supabase", "Railway", "Resend",
  "Cal.com", "Planetscale", "Neon", "Clerk", "PostHog",
]

const pricingPlans = [
  { name: "Free", price: "$0", period: "/mo", features: ["1,000 searches/mo", "5 crawls/day", "1 workspace", "Community support"] },
  { name: "Pro", price: "$29", period: "/mo", features: ["50,000 searches/mo", "500 crawls/day", "5 workspaces", "Email support"] },
  { name: "Team", price: "$99", period: "/mo", features: ["500,000 searches/mo", "5,000 crawls/day", "Unlimited workspaces", "Priority support"] },
]

function ToolRunner() {
  const [activeTab, setActiveTab] = useState("Search")
  const active = capabilities.find((c) => c.tab === activeTab)!

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--v2-border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex border-b border-[var(--v2-border)]">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTab(tool.label)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tool.id
                ? "text-[var(--text-1)] bg-[var(--surface-2)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            }`}
          >
            <tool.icon className="size-4" />
            <span className="hidden sm:inline">{tool.label}</span>
          </button>
        ))}
      </div>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-[var(--text-1)]">{active.title}</h3>
        <p className="mt-2 text-sm text-[var(--text-2)]">{active.description}</p>
        <div className="mt-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
            <Terminal className="size-3.5 text-[var(--text-3)]" />
            <span className="text-xs text-[var(--text-3)]">terminal</span>
          </div>
          <div className="p-4 font-mono text-xs leading-relaxed">
            <pre className="text-[var(--text-2)] whitespace-pre-wrap">{active.code}</pre>
            <pre className="mt-3 text-[var(--green)] whitespace-pre-wrap">{active.output}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function V2Home() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-1)] [--border:#222222]">
      {/* Hero */}
      <section className="relative border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-24 lg:grid lg:grid-cols-[1fr_1fr] lg:gap-12 lg:py-32">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-3)]">
              ContextOS + ContextCrawl
            </p>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[var(--text-1)] sm:text-5xl lg:text-6xl" style={{ letterSpacing: "-0.03em" }}>
              Web intelligence infrastructure for AI agents.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-[var(--text-2)]">
              ContextOS remembers your context. ContextCrawl turns the web into agent-ready data.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start building free
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="https://docs.amansagar.in"
                className="inline-flex items-center gap-2 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--text-1)]"
              >
                Read the docs
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-4 text-xs text-[var(--text-3)]">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--green)]" />
                1,000 searches/mo free
              </span>
              <span>No credit card required</span>
            </div>
          </div>
          <div className="mt-12 lg:mt-0">
            <ToolRunner />
          </div>
        </div>
      </section>

      {/* Logo wall */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <p className="text-center text-sm text-[var(--text-3)]">Trusted by builders at</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {logos.map((logo) => (
              <span
                key={logo}
                className="text-sm font-medium text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Product split */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-24 lg:grid lg:grid-cols-2 lg:gap-6">
          {products.map((product) => (
            <Link
              key={product.name}
              href={product.href}
              className="group flex flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 transition-colors hover:border-[var(--border-mid)]"
            >
              <product.icon className="size-8 text-[var(--text-2)]" />
              <h3 className="mt-6 text-xl font-semibold text-[var(--text-1)]">{product.name}</h3>
              <p className="mt-3 text-sm text-[var(--text-2)]">{product.description}</p>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-3)] transition-colors group-hover:text-[var(--text-1)]">
                Explore <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Capability tabs */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-3)]">
              ContextCrawl API
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-1)] sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Six tools. One API.
            </h2>
            <p className="mt-4 text-[var(--text-2)]">
              Every endpoint returns structured JSON. No HTML parsing. No rate limit headaches.
            </p>
          </div>
          <div className="mt-12">
            <ToolRunner />
          </div>
        </div>
      </section>

      {/* Benchmarks */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-3)]">
              Benchmarks
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-1)] sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Numbers, not adjectives.
            </h2>
          </div>
          <div className="mt-12 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--text-1)]">Task</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--text-1)]">Metric</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--text-1)]">ContextCrawl</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--text-3)]">Exa</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--text-3)]">Tavily</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-6 py-4 text-sm text-[var(--text-1)]">{row.task}</td>
                    <td className="px-6 py-4 text-sm text-[var(--text-2)]">{row.metric}</td>
                    <td className="px-6 py-4 font-mono text-sm font-medium text-[var(--green)]">{row.us}</td>
                    <td className="px-6 py-4 font-mono text-sm text-[var(--text-3)]">{row.exa}</td>
                    <td className="px-6 py-4 font-mono text-sm text-[var(--text-3)]">{row.tavily}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* API onboarding */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-24 lg:grid lg:grid-cols-[1fr_1fr] lg:gap-12">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-3)]">
              Developer onboarding
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-1)] sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Start in 30 seconds.
            </h2>
            <p className="mt-4 text-[var(--text-2)]">
              One API key. One endpoint. Structured data back. No SDK required — though we have Python, TypeScript, MCP, and CLI.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                API Playground
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--text-1)]"
              >
                Onboard your Agent
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-xs text-[var(--text-3)]">
              <span className="flex items-center gap-1.5"><Check className="size-3" /> Python SDK</span>
              <span className="flex items-center gap-1.5"><Check className="size-3" /> TypeScript SDK</span>
              <span className="flex items-center gap-1.5"><Check className="size-3" /> MCP Integration</span>
              <span className="flex items-center gap-1.5"><Check className="size-3" /> CLI</span>
            </div>
          </div>
          <div className="mt-8 lg:mt-0">
            <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
                <Terminal className="size-3.5 text-[var(--text-3)]" />
                <span className="text-xs text-[var(--text-3)]">terminal</span>
              </div>
              <div className="p-5 font-mono text-xs leading-relaxed">
                <p className="text-[var(--text-3)]"># Get your API key</p>
                <p className="text-[var(--text-2)]">curl https://api.amansagar.in/agents.md</p>
                <p className="mt-4 text-[var(--text-3)]"># Make your first search</p>
                <p className="text-[var(--text-2)]">curl -X POST https://api.amansagar.in/v1/search \</p>
                <p className="text-[var(--text-2)]">  -H &quot;Authorization: Bearer $KEY&quot; \</p>
                <p className="text-[var(--text-2)]">  -d &apos;{`{"query": "hello world"}`}&apos;</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-3)]">
              Pricing
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-1)] sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Free to start. Scale when ready.
            </h2>
            <p className="mt-4 text-[var(--text-2)]">
              1,000 searches/month free. No credit card. Upgrade for higher limits and priority support.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6"
              >
                <h3 className="text-sm font-semibold text-[var(--text-1)]">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[var(--text-1)]">{plan.price}</span>
                  <span className="text-sm text-[var(--text-3)]">{plan.period}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--text-3)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 flex w-full items-center justify-center rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold text-[var(--text-1)] transition-colors hover:border-[var(--border-mid)]"
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/pricing" className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]">
              View all plans and FAQ →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--surface)]">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="grid gap-12 md:grid-cols-5">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2">
                <span className="size-6 rounded-[var(--r-sm)] bg-[var(--brand)]" />
                <span className="text-sm font-semibold text-[var(--text-1)]">ContextOS</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-3)]">Products</p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-3)]">
                <li><Link href="/products/contextos" className="hover:text-[var(--text-2)]">ContextOS</Link></li>
                <li><Link href="/products/search" className="hover:text-[var(--text-2)]">Search API</Link></li>
                <li><Link href="/products/scrape" className="hover:text-[var(--text-2)]">Scrape API</Link></li>
                <li><Link href="/products/crawl" className="hover:text-[var(--text-2)]">Crawl API</Link></li>
                <li><Link href="/products/map" className="hover:text-[var(--text-2)]">Map API</Link></li>
                <li><Link href="/products/extract" className="hover:text-[var(--text-2)]">Extract API</Link></li>
                <li><Link href="/products/monitor" className="hover:text-[var(--text-2)]">Monitor API</Link></li>
                <li><Link href="/pricing" className="hover:text-[var(--text-2)]">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-3)]">Developers</p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-3)]">
                <li><a href="https://docs.amansagar.in" className="hover:text-[var(--text-2)]">Docs</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">API Reference</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Python SDK</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">TypeScript SDK</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">MCP Integration</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">CLI</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Changelog</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Status</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-3)]">Company</p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-3)]">
                <li><a href="#" className="hover:text-[var(--text-2)]">About</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Blog</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Careers</a></li>
                <li><a href="/benchmarks" className="hover:text-[var(--text-2)]">Benchmarks</a></li>
                <li><Link href="/pricing" className="hover:text-[var(--text-2)]">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-3)]">Legal</p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-3)]">
                <li><a href="#" className="hover:text-[var(--text-2)]">Terms</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Privacy</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Acceptable Use</a></li>
                <li><a href="#" className="hover:text-[var(--text-2)]">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-4 border-t border-[var(--border)] pt-8 text-xs text-[var(--text-3)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--green)]" />
                All Systems Operational
              </span>
              <span>SOC-2 Type II</span>
            </div>
            <span>© 2026 Kontext</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
