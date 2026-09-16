"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Zap, ArrowRight } from "lucide-react";

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  features: string[];
  buttonText: string;
  href: string;
  isPopular?: boolean;
  badge?: string;
}

export interface PricingCardsProps {
  plans: PricingPlan[];
}

export function PricingCards({ plans }: PricingCardsProps) {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <div className="w-full">
      <div className="flex items-center justify-center gap-4 mt-12 mb-10">
        <span className={`text-sm font-medium transition-colors ${!isYearly ? "text-[#f2f5ef]" : "text-white/40"}`}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={isYearly}
          onClick={() => setIsYearly(!isYearly)}
          className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ${
            isYearly
              ? "border-[#f6e879]/60 bg-[#f6e879] shadow-[0_0_12px_rgba(246,232,121,0.3)]"
              : "border-white/25 bg-[#3a3a3a]"
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] block h-[18px] w-[18px] rounded-full bg-[#e0e0e0] shadow-md transition-transform duration-200 ${
              isYearly ? "translate-x-[20px]" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm font-medium transition-colors ${isYearly ? "text-[#f2f5ef]" : "text-white/40"}`}>
          Yearly
          <span className="ml-1.5 rounded-full bg-[#f6e879]/10 px-2 py-0.5 text-[10px] font-semibold text-[#f6e879]">Save 20%</span>
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-[24px] border p-2 transition-all duration-200 ${
              plan.isPopular
                ? "border-[#f6e879]/40 bg-[#f6e879]/[0.04] shadow-[0_0_40px_rgba(246,232,121,0.08)]"
                : "border-white/[0.08] bg-white/[0.02]"
            }`}
          >
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6e879] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#171814]">
                  <Zap aria-hidden="true" className="size-3" />
                  {plan.badge}
                </span>
              </div>
            )}

            <div className="px-5 pt-6 pb-4">
              <h3 className="text-xl font-bold tracking-[-0.02em] text-[#f2f5ef]">{plan.name}</h3>
              <p className="mt-2 text-sm text-white/40">{plan.description}</p>
            </div>

            <div className="flex flex-1 flex-col rounded-[20px] border border-white/[0.06] bg-[#12130f] p-6 relative z-10">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-[#f2f5ef]">
                  {plan.currency}{isYearly ? plan.yearlyPrice : plan.monthlyPrice}
                </span>
                <span className="text-sm font-medium text-white/40">
                  / {isYearly ? "year" : "month"}
                </span>
              </div>

              <ul className="mt-8 flex-1 space-y-3.5">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <Check aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${plan.isPopular ? "text-[#f6e879]" : "text-[#67d9bd]"}`} />
                    <span className="text-sm text-white/65">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-8 flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${
                  plan.isPopular
                    ? "bg-[#f6e879] text-[#171814] shadow-[0_2px_12px_rgba(246,232,121,0.35)] hover:bg-[#fff5a5]"
                    : "border border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                {plan.buttonText}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
