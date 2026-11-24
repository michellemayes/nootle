import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, CreditCard, Gift, Laptop, LogOut, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { SignOutButton } from "@/components/SignOutButton";
import { SiteFooter } from "@/components/SiteFooter";
import { outfit } from "@/components/site-config";
import { cardClass, formatDate, primaryButton, quietButton, secondaryButton } from "@/components/ui";
import { REFERRAL_DISCOUNT_PERCENT, REFERRAL_REWARD_DAYS } from "@/lib/account/plans";
import { getCurrentAccount } from "@/lib/account/session";
import { summarize } from "@/lib/account/summary";
import type { AccountSummary } from "@/lib/account/types";
import { CopyLink } from "./CopyLink";
import { Welcome } from "./Welcome";

export const metadata: Metadata = {
  title: "Account - Nootle",
  robots: { index: false, follow: false },
};

const INTERVAL_LABEL = { monthly: "Monthly", yearly: "Yearly", lifetime: "Lifetime" } as const;

interface PlanDetails {
  title: string;
  badge?: string;
  line?: string;
  warn?: boolean;
}

function planDetails({ plan, pro, bonusProUntil }: AccountSummary): PlanDetails {
  if (plan.tier === "pro" && plan.status !== "revoked") {
    const badge = plan.interval ? INTERVAL_LABEL[plan.interval] : undefined;
    if (plan.interval === "lifetime") return { title: "Pro", badge, line: "Paid once. Yours for good." };
    if (plan.status === "past_due")
      return { title: "Pro", badge, line: "Your last payment didn't go through. Update your card to keep Pro.", warn: true };
    if (plan.status === "canceled" && plan.endsAt) return { title: "Pro", badge, line: `Ends ${formatDate(plan.endsAt)}` };
    if (plan.renewsAt) return { title: "Pro", badge, line: `Renews ${formatDate(plan.renewsAt)}` };
    return { title: "Pro", badge };
  }
  if (pro && bonusProUntil) return { title: "Pro", badge: "From friends", line: `Until ${formatDate(bonusProUntil)}` };
  return { title: "Free" };
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "nootle.ai";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[var(--color-bg)]/60 px-4 py-3">
      <dd className={`${outfit} text-3xl font-bold tabular-nums text-[var(--color-text)]`}>{value}</dd>
      <dt className="text-sm text-[var(--color-text-secondary)]">{label}</dt>
    </div>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, params] = await Promise.all([getCurrentAccount(), searchParams]);
  if (!account) redirect("/signin?next=/account");

  const summary = summarize(account, await origin());
  const details = planDetails(summary);
  const hasBilling = Boolean(account.polarCustomerId) || summary.plan.tier === "pro";
  const bonusOnTop = summary.plan.tier === "pro" && summary.bonusProUntil;
  const { referral } = summary;

  return (
    <>
      <Navbar signedIn />
      <main id="main-content" className="relative overflow-hidden px-6 pt-32 pb-24">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-[480px]"
          style={{
            background:
              "radial-gradient(55% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-3xl">
          {params.welcome === "1" && <Welcome pro={summary.pro} />}
          {params.billing === "unavailable" && (
            <p role="status" className={`${cardClass} mb-6 flex items-center gap-2 px-5 py-4 text-sm text-[var(--color-amber)]`}>
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              Billing couldn&apos;t open. Try again in a minute.
            </p>
          )}

          <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <h1 className={`${outfit} text-4xl font-extrabold tracking-tight text-[var(--color-text)] md:text-5xl`}>
              Account
            </h1>
            <p className="min-w-0 truncate text-[var(--color-text-secondary)]">{summary.email}</p>
          </header>

          <section aria-labelledby="plan-heading" className={`${cardClass} relative overflow-hidden p-6 sm:p-8`}>
            {summary.pro && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
                style={{ background: "var(--color-accent)" }}
              />
            )}
            <div className="relative flex flex-wrap items-center gap-x-8 gap-y-6">
              <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
                <Image src="/nootle-icon.svg" alt="" width={56} height={56} className="shrink-0" />
                <div className="min-w-0">
                  <h2 id="plan-heading" className="flex flex-wrap items-center gap-2">
                    <span className={`${outfit} text-3xl font-extrabold text-[var(--color-text)]`}>
                      Nootle {details.title}
                    </span>
                    {details.badge && (
                      <span className="rounded-full bg-[var(--color-accent)]/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                        {details.badge}
                      </span>
                    )}
                  </h2>
                  {details.line && (
                    <p
                      className={`mt-1 flex items-start gap-1.5 text-sm ${
                        details.warn ? "text-[var(--color-amber)]" : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {details.warn && <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
                      {details.line}
                    </p>
                  )}
                  {bonusOnTop && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-emerald)]">
                      <Sparkles aria-hidden="true" className="h-4 w-4" />
                      Bonus Pro from friends until {formatDate(summary.bonusProUntil!)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex w-full flex-wrap gap-3 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                {!summary.pro && (
                  <Link href="/pricing" className={`${primaryButton} group`}>
                    Upgrade to Pro
                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )}
                {hasBilling && (
                  <a href="/api/billing/portal" className={details.warn ? primaryButton : secondaryButton}>
                    <CreditCard aria-hidden="true" className="h-4 w-4" />
                    Manage billing
                  </a>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="invite-heading" className={`${cardClass} mt-6 p-6 sm:p-8`}>
            <div className="mb-5 flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-sponsor)]/15 text-[var(--color-sponsor)]">
                <Gift aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="invite-heading" className={`${outfit} text-xl font-bold text-[var(--color-text)]`}>
                  Give {REFERRAL_DISCOUNT_PERCENT}%, get a month
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Friends get {REFERRAL_DISCOUNT_PERCENT}% off their first payment. You get {REFERRAL_REWARD_DAYS} days
                  of Pro for each one who pays.
                </p>
              </div>
            </div>
            <CopyLink url={referral.url} />
            <dl className="mt-5 grid grid-cols-3 gap-3">
              <Stat value={referral.joined} label="Joined" />
              <Stat value={referral.paid} label="Paid" />
              <Stat value={referral.monthsEarned} label={referral.monthsEarned === 1 ? "Month earned" : "Months earned"} />
            </dl>
          </section>

          <section
            aria-label="Sign out"
            className={`${cardClass} mt-6 flex flex-wrap items-center justify-between gap-4 p-5 sm:px-8`}
          >
            {params.devices === "signed-out" ? (
              <p role="status" className="flex items-center gap-2 text-sm text-[var(--color-emerald)]">
                <Check aria-hidden="true" className="h-4 w-4" />
                Every Mac is signed out.
              </p>
            ) : (
              <SignOutButton endpoint="/api/account/devices/signout" then="/account?devices=signed-out" className={quietButton}>
                <Laptop aria-hidden="true" className="h-4 w-4" />
                Sign out every Mac
              </SignOutButton>
            )}
            <SignOutButton then="/" className={quietButton}>
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Sign out
            </SignOutButton>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
