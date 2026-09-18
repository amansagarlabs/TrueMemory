"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPolarCheckout, fetchPlans, type SubscriptionPlan } from "@/services/subscriptions";
import { loadAuthUser } from "@/lib/auth";

function formatPrice(cents: number, currency: string) {
  if (!cents) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loadAuthUser()) {
      router.replace("/login?redirect=%2Fsubscription");
      return;
    }
    fetchPlans().then(setPlans).catch((err) => setError(err.message));
  }, [router]);

  async function upgrade(plan: SubscriptionPlan) {
    if (plan.plan_key === "free") return;
    setLoading(plan.plan_key);
    setError("");
    try {
      const checkout = await createPolarCheckout(plan.plan_key, cycle);
      window.location.assign(checkout.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">TrueMemory billing</p>
            <h1 className="text-4xl font-semibold tracking-tight">Choose the memory capacity you need.</h1>
            <p className="mt-3 max-w-xl text-muted-foreground">Upgrade securely through Polar and unlock higher limits for your workspace.</p>
          </div>
          <div className="rounded-full border p-1 text-sm">
            {(["monthly", "yearly"] as const).map((value) => (
              <button key={value} onClick={() => setCycle(value)} className={`rounded-full px-4 py-2 ${cycle === value ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                {value === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="mb-6 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <section key={plan.plan_key} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">{plan.plan_name}</h2>
              <p className="mt-2 min-h-12 text-sm text-muted-foreground">{plan.description || "A focused workspace for your memory."}</p>
              <p className="mt-6 text-3xl font-semibold">{formatPrice(cycle === "monthly" ? plan.price_monthly_cents : plan.price_yearly_cents, plan.currency)}<span className="text-sm font-normal text-muted-foreground">{plan.plan_key === "free" ? "" : ` / ${cycle === "monthly" ? "month" : "year"}`}</span></p>
              <button disabled={plan.plan_key === "free" || loading !== null} onClick={() => upgrade(plan)} className="mt-8 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50">
                {loading === plan.plan_key ? "Opening checkout…" : plan.plan_key === "free" ? "Current free plan" : "Upgrade with Polar"}
              </button>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
