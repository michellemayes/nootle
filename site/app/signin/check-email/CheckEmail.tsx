"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Loader2, MailCheck, Wrench } from "lucide-react";
import { SPRING } from "@/components/motion";
import { quietButton } from "@/components/ui";
import { authHeading } from "../AuthShell";
import { RESEND_COOLDOWN_SECONDS, readPending, requestLink, savePending } from "../request-link";
import type { PendingSignIn } from "../params";

const noop = () => () => {};

function usePending(email: string) {
  const raw = useSyncExternalStore(
    noop,
    () => JSON.stringify(readPending()),
    () => "null",
  );
  const pending = JSON.parse(raw) as PendingSignIn | null;
  return pending && pending.email.toLowerCase() === email.toLowerCase() ? pending : null;
}

export function CheckEmail({ email }: { email: string }) {
  const stored = usePending(email);
  const [override, setOverride] = useState<PendingSignIn | null>(null);
  const pending = override ?? stored;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const sentAt = pending?.sentAt ?? 0;
  const wait = Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const result = await requestLink({ email, next: pending?.next, appState: pending?.appState });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    const updated = { email, next: pending?.next, appState: pending?.appState, devLink: result.devLink, sentAt: Date.now() };
    savePending(updated);
    setOverride(updated);
    setNow(Date.now());
    setMessage({ ok: true, text: "Sent another link." });
  }

  return (
    <div className="text-center">
      <motion.span
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={SPRING}
        className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
      >
        <MailCheck aria-hidden="true" className="h-8 w-8" />
      </motion.span>
      <h1 className={authHeading}>Check your email</h1>
      <p className="mt-3 text-[var(--color-text-secondary)]">
        We sent a sign-in link to
        <br />
        <strong className="font-semibold text-[var(--color-text)] break-all">{email}</strong>
      </p>

      {pending?.devLink && (
        <a
          href={pending.devLink}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--color-amber)]/50 bg-[var(--color-amber)]/10 px-4 py-3 text-left text-sm text-[var(--color-text)] hover:border-[var(--color-amber)]"
        >
          <Wrench aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--color-amber)]" />
          <span className="min-w-0">
            <span className="block font-semibold">Dev sign-in link</span>
            <span className="block truncate text-xs text-[var(--color-text-secondary)]">{pending.devLink}</span>
          </span>
        </a>
      )}

      <div className="mt-8 flex flex-col items-center gap-2 border-t border-[var(--color-border)] pt-6">
        <button type="button" onClick={resend} disabled={busy || wait > 0} className={quietButton}>
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {wait > 0 ? `Resend in ${wait}s` : "Resend link"}
        </button>
        <p role="status" className="min-h-5 text-sm">
          {message && (
            <span
              className={`inline-flex items-center gap-1.5 ${
                message.ok ? "text-[var(--color-emerald)]" : "text-[var(--color-sponsor)]"
              }`}
            >
              {message.ok && <Check aria-hidden="true" className="h-4 w-4" />}
              {message.text}
            </span>
          )}
        </p>
        <Link
          href={pending?.appState ? `/signin?app=1&state=${pending.appState}` : "/signin"}
          className="text-sm text-[var(--color-text-secondary)] underline hover:text-[var(--color-text)]"
        >
          Use a different email
        </Link>
      </div>
    </div>
  );
}
