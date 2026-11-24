"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { PRICES } from "@/lib/account/plans";
import type { PlanInterval } from "@/lib/account/types";
import { monthlyEquivalent, usd, withReferralDiscount } from "@/components/pricing";
import { SPRING } from "@/components/motion";
import { outfit } from "@/components/site-config";
import { primaryButton } from "@/components/ui";

const TAG: Partial<Record<PlanInterval, string>> = { yearly: "Best value", lifetime: "Pay once" };
const CADENCE: Record<PlanInterval, string> = { monthly: "/mo", yearly: "/yr", lifetime: "once" };
const CTA: Record<PlanInterval, string> = { monthly: "Get Pro monthly", yearly: "Get Pro yearly", lifetime: "Get Pro for life" };
const FIRST: Record<PlanInterval, string> = { monthly: "first month", yearly: "first year", lifetime: "" };

export function ProPicker({ discount }: { discount: boolean }) {
  const [selected, setSelected] = useState<PlanInterval>("yearly");
  const option = PRICES.find((p) => p.interval === selected)!;

  return (
    <div>
      <fieldset className="space-y-2.5">
        <legend className="sr-only">Billing</legend>
        {PRICES.map((p) => {
          const active = p.interval === selected;
          const perMonth = p.interval === "yearly" ? monthlyEquivalent(p) : null;
          const pay = discount ? withReferralDiscount(p.price) : p.price;
          return (
            <label
              key={p.interval}
              className={`relative flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)] ${
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-bg)]/40 hover:border-[var(--color-accent)]/50"
              }`}
            >
              <input
                type="radio"
                name="interval"
                value={p.interval}
                checked={active}
                onChange={() => setSelected(p.interval)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  active ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="pro-picker-dot"
                    transition={SPRING}
                    className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]"
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-[var(--color-text)]">{p.label}</span>
                {TAG[p.interval] && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      p.interval === "yearly"
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {TAG[p.interval]}
                  </span>
                )}
              </span>
              <span className="text-right leading-tight">
                <span className="block whitespace-nowrap">
                  {discount && (
                    <s className="mr-1.5 text-sm text-[var(--color-text-secondary)]">{usd(p.price)}</s>
                  )}
                  <span className={`${outfit} text-xl font-bold text-[var(--color-text)] tabular-nums`}>{usd(pay)}</span>
                  <span className="ml-0.5 text-sm text-[var(--color-text-secondary)]">{CADENCE[p.interval]}</span>
                </span>
                {(perMonth !== null || (discount && FIRST[p.interval])) && (
                  <span className="block text-xs text-[var(--color-text-secondary)] tabular-nums">
                    {discount && FIRST[p.interval] ? FIRST[p.interval] : `${usd(perMonth!)}/mo`}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>
      <a href={`/api/checkout?plan=${option.interval}`} className={`${primaryButton} group mt-5 w-full py-3.5 text-base`}>
        {CTA[option.interval]}
        <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}
