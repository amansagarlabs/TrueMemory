"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Zap, Shield, Globe, Brain, Bot, Database, FileText, MessageSquare, Users, Infinity, Plus, Minus } from "lucide-react";
import { PaperDither } from "@/components/ui/paper-dither";
import { PricingCards, type PricingPlan } from "@/components/ui/pricing-cards";
import { SiteFooter } from "@/components/ui/site-footer";

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "For individuals exploring TrueMemory.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: "$",
    features: [
      "5 artifacts",
      "20 crawl jobs / day",
      "100 memory entries",
      "500 pages crawled",
      "1 workspace",
      "20 conversations / day",
      "Web search & scraping",
      "Community support",
    ],
    buttonText: "Get started free",
    href: "/signup",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For builders who need more power.",
    monthlyPrice: 29,
    yearlyPrice: 278,
    currency: "$",
    features: [
      "100 artifacts",
      "500 crawl jobs / day",
      "5,000 memory entries",
      "20,000 pages crawled",
      "10 workspaces",
      "5 agents",
      "200 conversations / day",
      "Deep crawl & extraction",
      "MCP tool support",
      "PDF processing",
      "Priority support",
    ],
    buttonText: "Start Pro trial",
    href: "/signup?plan=pro",
    isPopular: true,
    badge: "Most popular",
  },
  {
    id: "team",
    name: "Team",
    description: "For teams building with TrueMemory.",
    monthlyPrice: 79,
    yearlyPrice: 758,
    currency: "$",
    features: [
      "Unlimited artifacts",
      "Unlimited crawl jobs",
      "Unlimited memory",
      "Unlimited pages",
      "Unlimited workspaces",
      "Unlimited agents",
      "Unlimited conversations",
      "Browser automation",
      "MCP tool support",
      "Custom webhooks",
      "Team collaboration",
      "Dedicated support",
    ],
    buttonText: "Start Team trial",
    href: "/signup?plan=team",
  },
];

const features = [
  {
    icon: Brain,
    title: "Persistent memory",
    description: "Every conversation, decision, and artifact stays indexed. Your context compounds over time instead of resetting.",
  },
  {
    icon: Globe,
    title: "Web intelligence",
    description: "Scrape, crawl, map, and search the web. Bring live evidence into your workspace only when local context is not enough.",
  },
  {
    icon: Bot,
    title: "Agent tools",
    description: "Build agents with MCP support, custom webhooks, and permissioned tool calls. Every action stays visible and reversible.",
  },
  {
    icon: Database,
    title: "Vector retrieval",
    description: "Automatic embedding and semantic search across all your documents, notes, and memories with Milvus/Zilliz integration.",
  },
  {
    icon: FileText,
    title: "Document pipeline",
    description: "Upload PDFs and documents. Watch them chunk, embed, and index in real-time. Sources stay attached to every answer.",
  },
  {
    icon: Shield,
    title: "Scope-based access",
    description: "Plan-based permissions control what agents can do. Enterprise gets full access including browser automation.",
  },
];

const comparisons = [
  { feature: "Artifacts", free: "5", pro: "100", team: "Unlimited" },
  { feature: "Crawl jobs / day", free: "20", pro: "500", team: "Unlimited" },
  { feature: "Memory entries", free: "100", pro: "5,000", team: "Unlimited" },
  { feature: "Pages crawled", free: "500", pro: "20,000", team: "Unlimited" },
  { feature: "Workspaces", free: "1", pro: "10", team: "Unlimited" },
  { feature: "Agents", free: "—", pro: "5", team: "Unlimited" },
  { feature: "Conversations / day", free: "20", pro: "200", team: "Unlimited" },
  { feature: "Deep crawl", free: "—", pro: "✓", team: "✓" },
  { feature: "Data extraction", free: "—", pro: "✓", team: "✓" },
  { feature: "MCP tools", free: "—", pro: "✓", team: "✓" },
  { feature: "PDF processing", free: "—", pro: "✓", team: "✓" },
  { feature: "Browser automation", free: "—", pro: "—", team: "✓" },
  { feature: "Custom webhooks", free: "—", pro: "—", team: "✓" },
  { feature: "Team collaboration", free: "—", pro: "—", team: "✓" },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#10100f] transition hover:border-white/[0.12]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-sm font-medium"
      >
        {question}
        <span className="shrink-0 text-white/30 transition-colors">
          {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </span>
      </button>
      {open && (
        <p className="px-6 pb-5 text-sm leading-6 text-white/40">{answer}</p>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <main className="dark min-h-screen bg-[#070707] text-white">
      <div className="mx-auto w-full max-w-[1360px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.07] hover:text-white">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Home
          </Link>
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]">
            <span aria-hidden="true" className="size-6 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)]" />
            TrueMemory
          </Link>
        </header>
      </div>

      {/* Hero */}
      <section className="px-5 sm:px-8 lg:px-10">
        <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[24px]">
          <PaperDither
            className="inset-0 opacity-[0.12]"
            dark={{ colorBack: "#00000000", colorFront: "#f6e879" }}
            light={{ colorBack: "#00000000", colorFront: "#f6e879" }}
            maxPixelCount={1400 * 600}
            scale={0.7}
            shape="wave"
            size={2}
            speed={0.15}
            type="4x4"
          />
          <div className="relative z-10 pt-16 pb-20 text-center lg:pt-24 lg:pb-28">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">Pricing</p>
            <h1 className="mt-4 font-heading text-4xl font-medium tracking-[-0.05em] sm:text-6xl">
              Simple plans, <span className="text-[#f6e879]">serious power</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-white/45 sm:text-lg">
              Start free. Scale as your memory and agent needs grow. No hidden fees, no surprises.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="mx-auto max-w-[1100px] px-5 sm:px-8 lg:px-10">
        <PricingCards plans={plans} />
      </section>

      {/* Features Grid */}
      <section className="mx-auto max-w-[1100px] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">What you get</p>
          <h2 className="mt-4 text-3xl font-medium tracking-[-0.05em] sm:text-4xl">Every plan includes</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/40">Core capabilities that make TrueMemory a dependable infrastructure layer, not just another chatbot.</p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-[20px] border border-white/[0.06] bg-[#10100f] p-6 transition hover:border-white/[0.12]">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#f6e879]/10 text-[#f6e879]">
                <feature.icon aria-hidden="true" className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/40">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="mx-auto max-w-[1100px] px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">Compare plans</p>
          <h2 className="mt-4 text-3xl font-medium tracking-[-0.05em] sm:text-4xl">Full feature comparison</h2>
        </div>
        <div className="mt-14 overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#10100f]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="px-6 py-4 text-left text-sm font-medium text-white/40">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-white/60">Free</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-[#f6e879]">Pro</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-white/60">Team</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => (
                  <tr key={row.feature} className="border-b border-white/[0.04] last:border-b-0">
                    <td className="px-6 py-3.5 text-sm text-white/55">{row.feature}</td>
                    <td className="px-6 py-3.5 text-center text-sm text-white/40">{row.free}</td>
                    <td className="px-6 py-3.5 text-center text-sm font-medium text-[#f6e879]">{row.pro}</td>
                    <td className="px-6 py-3.5 text-center text-sm text-white/40">{row.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[800px] px-5 pb-20 sm:px-8 lg:pb-28">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">FAQ</p>
          <h2 className="mt-4 text-3xl font-medium tracking-[-0.05em] sm:text-4xl">Common questions</h2>
        </div>
        <div className="mt-14 space-y-3">
          {[
            ["Can I switch plans anytime?", "Yes. Upgrade or downgrade at any time. When upgrading, you are charged a prorated amount. When downgrading, the credit applies to your next billing cycle."],
            ["What happens when I hit my limits?", "You will be notified when approaching your plan limits. Once reached, new crawl jobs and conversations pause until the next day or until you upgrade."],
            ["Is there a free trial for Pro?", "Yes. Every new account starts with a 14-day Pro trial. No credit card required. After the trial, you can choose to upgrade or continue on the Free plan."],
            ["Do you offer annual billing?", "Yes. Annual billing saves 20% compared to monthly. You can switch from monthly to annual at any time from your billing settings."],
            ["What payment methods do you accept?", "We accept all major credit cards (Visa, Mastercard, Amex) via Stripe. Team and Enterprise plans can also pay via invoice."],
            ["Can I self-host TrueMemory?", "Yes. TrueMemory is open-source. You can self-host the stack including the Next.js frontend, FastAPI backend, PostgreSQL, and vector database."],
          ].map(([question, answer]) => (
            <FaqItem key={question} question={question} answer={answer} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1100px] px-5 pb-20 sm:px-8 lg:pb-28">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0a08]">
          <PaperDither
            className="inset-0 opacity-[0.15]"
            dark={{ colorBack: "#00000000", colorFront: "#f6e879" }}
            light={{ colorBack: "#00000000", colorFront: "#f6e879" }}
            maxPixelCount={1200 * 400}
            scale={0.6}
            shape="sphere"
            size={2}
            speed={0.12}
            type="4x4"
          />
          <div className="relative z-10 px-6 py-14 text-center sm:px-10 lg:py-20">
            <h2 className="text-3xl font-medium tracking-[-0.05em] sm:text-4xl">Ready to start remembering?</h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-white/40">Create your free account and start building grounded agent workflows in minutes.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/signup" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#f6e879] px-6 text-sm font-semibold text-[#171814] transition hover:bg-[#fff5a5]">
                Get started free
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/chat" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 text-sm font-medium text-white/60 transition hover:bg-white/[0.07]">
                Open workspace
              </Link>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
