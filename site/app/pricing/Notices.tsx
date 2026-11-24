"use client";

import { Clock, Gift } from "lucide-react";
import { outfit } from "@/components/site-config";
import { REFERRAL_DISCOUNT_PERCENT } from "@/lib/account/plans";
import { useCheckoutUnavailable, useReferralDiscount } from "./client-state";

export function Notices() {
  const unavailable = useCheckoutUnavailable();
  const discount = useReferralDiscount();

  return (
    <>
      {unavailable && (
        <p
          role="status"
          className="mx-auto mb-8 flex max-w-2xl items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm text-[var(--color-text-secondary)]"
        >
          <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-amber)]" />
          <span>
            <strong className="font-semibold text-[var(--color-text)]">Checkout opens soon.</strong> Your Pro
            trial and everything in Free work today.
          </span>
        </p>
      )}

      {discount && (
        <div className="relative mx-auto mb-8 flex max-w-2xl items-center gap-4 overflow-hidden rounded-2xl border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-5 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-accent)] text-white">
            <Gift aria-hidden="true" className="h-5 w-5" />
          </span>
          <p className="min-w-0">
            <span className={`${outfit} block text-lg font-bold text-[var(--color-text)]`}>
              {REFERRAL_DISCOUNT_PERCENT}% off your first payment
            </span>
            <span className="text-sm text-[var(--color-text-secondary)]">A friend&apos;s invite. Applied at checkout.</span>
          </p>
        </div>
      )}
    </>
  );
}
