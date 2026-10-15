"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { AI_PROVIDERS, CALL_APPS } from "@/components/site-config";
import { EASE_OUT } from "@/components/motion";

const stats: { from: number; to: number; format: (n: number) => string; label: string }[] = [
  { from: 2048, to: 0, format: (n) => `${n} MB`, label: "of meeting audio uploaded. Ever." },
  { from: 30, to: 0, format: (n) => `$${n}`, label: "a month, instead of a subscription" },
  { from: 0, to: AI_PROVIDERS.length, format: (n) => `${n}`, label: "ways to plug in your AI, local models included" },
  { from: 0, to: CALL_APPS.length, format: (n) => `${n}`, label: "call apps detected, no bot required" },
];

export function Stats() {
  return (
    <section aria-label="Nootle at a glance" className="px-6 pb-8">
      <dl className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)]">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 bg-[var(--color-bg)] p-6">
            <dt className="text-sm text-[var(--color-text-secondary)]">{stat.label}</dt>
            <dd className="order-first font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-extrabold tabular-nums text-[var(--color-text)]">
              <CountTo {...stat} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Renders the final value (so it's right without JavaScript), then counts to it once scrolled into view. */
function CountTo({ from, to, format }: { from: number; to: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 1 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView || reduce) return;
    const controls = animate(from, to, {
      duration: 1.6,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.textContent = format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [inView, reduce, from, to, format]);

  return <span ref={ref}>{format(to)}</span>;
}
