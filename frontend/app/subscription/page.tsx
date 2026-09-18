"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Gem, LockKeyhole, Sparkles, Zap } from "lucide-react";
import { createPolarCheckout, fetchPlans, type SubscriptionPlan } from "@/services/subscriptions";
import { loadAuthUser } from "@/lib/auth";

function formatPrice(cents: number, currency: string) {
  if (!cents) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loadAuthUser()) { router.replace("/login?redirect=%2Fsubscription"); return; }
    fetchPlans().then(setPlans).catch((err) => setError(err.message));
  }, [router]);

  async function upgrade(plan: SubscriptionPlan) {
    if (plan.plan_key === "free") return;
    setLoading(plan.plan_key); setError("");
    try { window.location.assign((await createPolarCheckout(plan.plan_key, cycle)).url); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to start checkout"); setLoading(null); }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f4ef] px-4 py-6 text-[#201a16] dark:bg-[#0e0e0e] dark:text-white sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_18%_12%,rgba(255,137,77,0.20),transparent_34%),radial-gradient(circle_at_85%_8%,rgba(255,216,113,0.18),transparent_28%)] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(255,102,49,0.16),transparent_34%),radial-gradient(circle_at_85%_8%,rgba(119,83,30,0.16),transparent_28%)]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between border-b border-black/8 pb-5 dark:border-white/10">
          <a href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span className="grid size-7 place-items-center rounded-lg bg-[#ff7442] text-white"><Sparkles className="size-3.5" /></span>TrueMemory</a>
          <a href="/profile" className="text-xs font-medium text-black/50 transition hover:text-black dark:text-white/45 dark:hover:text-white">Back to workspace <ArrowRight className="ml-1 inline size-3" /></a>
        </div>
        <div className="mb-12 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ff7442]/25 bg-[#ff7442]/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c9552b]"><Zap className="size-3" /> TrueMemory plans</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl">Give your memory <span className="text-[#e76638]">room to think.</span></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-black/55 dark:text-white/50">Start with the essentials. Upgrade when your workspace, agents, and connected sources need more headroom.</p>
          </div>
          <div className="justify-self-start rounded-2xl border border-black/10 bg-white/65 p-1.5 shadow-[0_12px_40px_rgba(67,42,25,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/5 lg:justify-self-end">
            {(["monthly", "yearly"] as const).map((value) => <button key={value} onClick={() => setCycle(value)} className={`rounded-xl px-5 py-2.5 text-xs font-semibold transition ${cycle === value ? "bg-[#211a16] text-white shadow-sm dark:bg-white dark:text-[#211a16]" : "text-black/45 hover:text-black dark:text-white/45 dark:hover:text-white"}`}>{value === "monthly" ? "Monthly" : "Yearly · save 17%"}</button>)}
          </div>
        </div>
        {error && <p className="mb-6 rounded-xl border border-red-400/30 bg-red-50/70 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</p>}
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const featured = plan.plan_key === "pro";
            const features = plan.plan_key === "free" ? ["100 saved memories", "Basic agent context", "3 connected sources"] : plan.plan_key === "team" ? ["Unlimited workspace context", "Shared agent memory", "Priority support"] : ["500K AI tokens / month", "Deep crawl & extraction", "Priority memory retrieval"];
            return <section key={plan.plan_key} className={`relative flex min-h-[390px] flex-col overflow-hidden rounded-[26px] border p-7 transition duration-300 hover:-translate-y-1 ${featured ? "border-[#ff7442]/60 bg-[#221a15] text-white shadow-[0_24px_70px_rgba(124,55,22,0.25)] dark:bg-[#211914]" : "border-black/8 bg-white/62 shadow-[0_14px_45px_rgba(67,42,25,0.06)] dark:border-white/10 dark:bg-white/[0.045]"}`}>
              {featured && <div className="absolute right-5 top-5 rounded-full bg-[#ff8b5e] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#2c130a]">Most popular</div>}
              <div className="mb-7 flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${featured ? "bg-white/10 text-[#ff9d76]" : "bg-[#ff7442]/10 text-[#d85d32]"}`}>{featured ? <Gem className="size-4" /> : <LockKeyhole className="size-4" />}</span><div><h2 className="text-lg font-semibold">{plan.plan_name}</h2><p className={`text-[11px] ${featured ? "text-white/45" : "text-black/40 dark:text-white/40"}`}>{plan.description || "A focused workspace for your memory."}</p></div></div>
              <p className="text-4xl font-semibold tracking-[-0.04em]">{formatPrice(cycle === "monthly" ? plan.price_monthly_cents : plan.price_yearly_cents, plan.currency)}<span className={`text-xs font-normal ${featured ? "text-white/45" : "text-black/40 dark:text-white/40"}`}>{plan.plan_key === "free" ? " forever" : ` / ${cycle === "monthly" ? "month" : "year"}`}</span></p>
              <ul className={`mt-7 space-y-3 text-sm ${featured ? "text-white/70" : "text-black/55 dark:text-white/60"}`}>{features.map((feature) => <li key={feature} className="flex items-center gap-2"><Check className={`size-3.5 ${featured ? "text-[#ff9d76]" : "text-[#e76638]"}`} />{feature}</li>)}</ul>
              <button disabled={plan.plan_key === "free" || loading !== null} onClick={() => upgrade(plan)} className={`mt-auto flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${featured ? "bg-[#ff8d60] text-[#2d140b] hover:bg-[#ffad8c]" : "bg-[#211a16] text-white hover:bg-[#392a22] dark:bg-white dark:text-[#211a16] dark:hover:bg-white/85"}`}>{loading === plan.plan_key ? "Opening checkout…" : plan.plan_key === "free" ? "Current free plan" : <>Upgrade with Polar <ArrowRight className="size-3.5" /></>}</button>
            </section>;
          })}
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/8 bg-white/45 px-5 py-4 text-[11px] text-black/45 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40"><span className="flex items-center gap-2"><LockKeyhole className="size-3.5" /> Secure checkout powered by Polar</span><span>Cancel anytime · Your memory stays yours</span></div>
      </div>
    </main>
  );
}
