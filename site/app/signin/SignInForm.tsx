"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { inputClass, primaryButton } from "@/components/ui";
import { requestLink, savePending } from "./request-link";

export function SignInForm({ next, appState }: { next?: string; appState?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const address = email.trim();
    const result = await requestLink({ email: address, next, appState });
    if (!result.ok) {
      setError(result.error);
      setSending(false);
      return;
    }
    savePending({ email: address, next, appState, devLink: result.devLink, sentAt: Date.now() });
    router.push(`/signin/check-email?email=${encodeURIComponent(address)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="email" className="sr-only">
        Email
      </label>
      <div className="relative">
        <Mail
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
        />
        <input
          id="email"
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          placeholder="you@work.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "email-error" : undefined}
          className={`${inputClass} pl-11`}
        />
      </div>
      {error && (
        <p id="email-error" role="alert" className="text-sm text-[var(--color-sponsor)]">
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className={`${primaryButton} group w-full py-3.5 text-base`}>
        {sending ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Email me a sign-in link
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
        {sending && <span>Sending…</span>}
      </button>
    </form>
  );
}
