"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, PartyPopper } from "lucide-react";
import { SPRING } from "@/components/motion";
import { outfit } from "@/components/site-config";
import type { AccountSummary } from "@/lib/account/types";

const BITS = [
  { x: -150, y: -70, r: -40, c: "var(--color-amber)" },
  { x: -95, y: -105, r: 25, c: "var(--color-accent)" },
  { x: -30, y: -120, r: 70, c: "var(--color-emerald)" },
  { x: 40, y: -115, r: -60, c: "var(--color-sponsor)" },
  { x: 105, y: -95, r: 35, c: "var(--color-cyan)" },
  { x: 155, y: -55, r: -20, c: "var(--color-amber)" },
  { x: -170, y: -10, r: 50, c: "var(--color-sponsor)" },
  { x: 175, y: 0, r: -45, c: "var(--color-accent)" },
];

/** After checkout: a celebration, or a short wait while Polar's webhook lands. */
export function Welcome({ pro }: { pro: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (pro) return;
    let tries = 0;
    const t = setInterval(async () => {
      if (++tries > 10) clearInterval(t);
      const summary = await fetch("/api/account", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<AccountSummary>) : null))
        .catch(() => null);
      if (summary?.pro) {
        clearInterval(t);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pro, router]);

  return (
    <section
      aria-live="polite"
      className="relative mb-8 overflow-hidden rounded-3xl border border-[var(--color-accent)]/50 px-6 py-10 text-center"
      style={{
        background:
          "radial-gradient(70% 90% at 50% 0%, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent 75%), var(--color-surface)",
      }}
    >
      <div className="relative mx-auto mb-5 h-16 w-16">
        {pro &&
          BITS.map((b, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-2.5 w-1.5 rounded-sm"
              style={{ background: b.c }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.4 }}
              animate={{ x: b.x, y: b.y, rotate: b.r * 4, opacity: [0, 1, 1, 0], scale: 1 }}
              transition={{ duration: 1.4, delay: 0.2 + i * 0.03, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        <motion.span
          initial={{ scale: 0.3, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...SPRING, stiffness: 320, damping: 14 }}
          className="relative grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-accent)] text-white shadow-[0_12px_40px_-10px_var(--color-accent)]"
        >
          {pro ? (
            <PartyPopper aria-hidden="true" className="h-8 w-8" />
          ) : (
            <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin" />
          )}
        </motion.span>
      </div>
      <h2 className={`${outfit} text-3xl font-extrabold tracking-tight text-[var(--color-text)] md:text-4xl`}>
        {pro ? "Welcome to Pro" : "Payment received"}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-[var(--color-text-secondary)]">
        {pro
          ? "Thanks for backing Nootle. Pro is on for every Mac you connect."
          : "Pro turns on as soon as Polar confirms it, usually within a minute."}
      </p>
    </section>
  );
}
