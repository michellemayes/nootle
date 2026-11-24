import type { Metadata } from "next";
import { Check, ChevronDown, Clock, Gift, Minus } from "lucide-react";
import { AppleLogo } from "@/components/AppleLogo";
import { landingMetadata } from "@/components/LandingPage";
import { Navbar } from "@/components/Navbar";
import { PageMotion } from "@/components/PageMotion";
import { SiteFooter } from "@/components/SiteFooter";
import { PRO_FROM, PRO_PRICE_SUMMARY } from "@/components/pricing";
import { RELEASES_URL, outfit } from "@/components/site-config";
import { cardClass, secondaryButton } from "@/components/ui";
import { getCurrentAccount } from "@/lib/account/session";
import { FREE_FEATURES, PRICES, PRO_FEATURES, REFERRAL_DISCOUNT_PERCENT, TRIAL_DAYS } from "@/lib/account/plans";
import { referralFromCookie } from "@/lib/referral-offer";
import { ProPicker } from "./ProPicker";

export const metadata: Metadata = landingMetadata({
  path: "/pricing",
  title: "Pricing - Nootle",
  description: `Nootle is free and open source. Pro adds Live Assist, workflows, briefs and more for ${PRO_PRICE_SUMMARY} (from ${PRO_FROM} a month). ${TRIAL_DAYS}-day Pro trial, no card.`,
});

const faqs = [
  {
    question: "Is Nootle still open source?",
    answer:
      "Yes. The whole app, Pro features included, stays open source under the MIT license. Pro pays for the time that goes into building it.",
  },
  {
    question: `What happens after the ${TRIAL_DAYS}-day trial?`,
    answer:
      "Pro features pause and everything in Free keeps working: recording, transcription, summaries, Ask and share links. Nothing is deleted, and Pro picks up where you left off whenever you upgrade.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Open your account on nootle.ai and choose Manage billing to cancel in a couple of clicks. Pro stays on until the end of the period you paid for.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes. If Pro isn't right for you, ask within 14 days of paying for a full refund.",
  },
  {
    question: "Who handles payments?",
    answer:
      "Polar, the merchant of record. Polar runs checkout, sales tax and VAT, invoices and the billing portal. nootle.ai never sees your card details.",
  },
];

const productJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Nootle Pro",
  description: `Pro plan for Nootle, the open-source AI meeting recorder for Mac: ${PRO_FEATURES.join(", ")}.`,
  brand: { "@type": "Brand", name: "Nootle" },
  url: "https://nootle.ai/pricing",
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", url: RELEASES_URL },
    ...PRICES.map((p) => ({
      "@type": "Offer",
      name: `Pro ${p.label}`,
      price: String(p.price),
      priceCurrency: "USD",
      url: `https://nootle.ai/api/checkout?plan=${p.interval}`,
      ...(p.interval !== "lifetime" && {
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(p.price),
          priceCurrency: "USD",
          billingDuration: 1,
          unitCode: p.interval === "monthly" ? "MON" : "ANN",
        },
      }),
    })),
  ],
});

function Feature({ children, pro = false }: { children: string; pro?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-[var(--color-text)]">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          pro ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-emerald)]/15 text-[var(--color-emerald)]"
        }`}
      >
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}

function Mark({ on, pro }: { on: boolean; pro?: boolean }) {
  return on ? (
    <span
      className={`mx-auto grid h-6 w-6 place-items-center rounded-full ${
        pro ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-emerald)]/15 text-[var(--color-emerald)]"
      }`}
    >
      <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
      <span className="sr-only">Included</span>
    </span>
  ) : (
    <span className="mx-auto grid h-6 w-6 place-items-center text-[var(--color-text-secondary)]/60">
      <Minus aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">Not included</span>
    </span>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ unavailable }, account, ref] = await Promise.all([searchParams, getCurrentAccount(), referralFromCookie()]);
  const discount = Boolean(ref && ref !== account?.referralCode);

  return (
    <>
      <noscript>
        <style>{"[data-hero]{opacity:1}"}</style>
      </noscript>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd }} />
      <Navbar signedIn={Boolean(account)} />
      <PageMotion id="main-content" className="relative overflow-hidden">
        <section aria-labelledby="pricing-heading" className="relative px-6 pt-36 pb-10">
          <div
            aria-hidden="true"
            data-parallax
            className="absolute inset-x-0 top-0 -z-10 h-[560px]"
            style={{
              background:
                "radial-gradient(55% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-3xl text-center">
            <h1
              id="pricing-heading"
              data-hero
              className={`${outfit} mb-5 text-4xl font-extrabold tracking-tight text-[var(--color-text)] md:text-6xl`}
            >
              Free forever. Pro when you want more.
            </h1>
            <p data-hero className="text-lg text-[var(--color-text-secondary)]">
              Every install starts with {TRIAL_DAYS} days of Pro. No card needed.
            </p>
          </div>
        </section>

        <section aria-label="Plans" className="px-6 pb-24">
          <div className="mx-auto max-w-5xl">
            {unavailable === "1" && (
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
              <div
                data-reveal
                className="relative mx-auto mb-8 flex max-w-2xl items-center gap-4 overflow-hidden rounded-2xl border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-5 py-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-accent)] text-white">
                  <Gift aria-hidden="true" className="h-5 w-5" />
                </span>
                <p className="min-w-0">
                  <span className={`${outfit} block text-lg font-bold text-[var(--color-text)]`}>
                    {REFERRAL_DISCOUNT_PERCENT}% off your first payment
                  </span>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    A friend&apos;s invite. Applied at checkout.
                  </span>
                </p>
              </div>
            )}

            <div className="grid items-start gap-6 md:grid-cols-[1fr_1.2fr]">
              <article data-reveal className={`${cardClass} flex h-full flex-col p-7 md:p-8`} aria-labelledby="free-plan">
                <h2 id="free-plan" className={`${outfit} text-xl font-bold text-[var(--color-text)]`}>
                  Free
                </h2>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className={`${outfit} text-5xl font-extrabold text-[var(--color-text)]`}>$0</span>
                  <span className="text-[var(--color-text-secondary)]">forever</span>
                </p>
                <ul className="mt-7 flex-1 space-y-3">
                  {FREE_FEATURES.map((f) => (
                    <Feature key={f}>{f}</Feature>
                  ))}
                </ul>
                <a href={RELEASES_URL} className={`${secondaryButton} mt-8 w-full py-3.5 text-base`}>
                  <AppleLogo className="h-4 w-4" />
                  Download for Mac
                </a>
              </article>

              <article
                data-reveal
                aria-labelledby="pro-plan"
                className="relative rounded-3xl border border-[var(--color-accent)]/60 bg-[var(--color-surface)] p-7 shadow-[0_30px_80px_-40px_var(--color-accent)] md:p-8"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id="pro-plan" className={`${outfit} text-xl font-bold text-[var(--color-text)]`}>
                    Pro
                  </h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    from <span className="font-semibold text-[var(--color-text)]">{PRO_FROM}</span> a month
                  </p>
                </div>
                <ul className="mt-5 mb-6 grid gap-3 sm:grid-cols-2">
                  {PRO_FEATURES.slice(0, 4).map((f) => (
                    <Feature key={f} pro>
                      {f}
                    </Feature>
                  ))}
                </ul>
                <ProPicker discount={discount} />
              </article>
            </div>
          </div>
        </section>

        <section aria-labelledby="compare-heading" className="bg-[var(--color-surface)] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2
              id="compare-heading"
              data-reveal
              className={`${outfit} mb-10 text-3xl font-bold text-[var(--color-text)] md:text-4xl`}
            >
              Free vs Pro
            </h2>
            <div data-reveal className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-surface-elevated)]">
                  <tr>
                    <th scope="col" className="px-4 py-3.5 font-semibold text-[var(--color-text)] sm:px-5">
                      <span className="sr-only">Feature</span>
                    </th>
                    <th scope="col" className={`${outfit} w-20 py-3.5 text-center font-semibold text-[var(--color-text)] sm:w-28`}>
                      Free
                    </th>
                    <th scope="col" className={`${outfit} w-20 py-3.5 text-center font-semibold text-[var(--color-accent)] sm:w-28`}>
                      Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--color-border)]">
                    <th scope="row" className="px-4 py-3 font-medium text-[var(--color-text)] sm:px-5">
                      Price
                    </th>
                    <td className="py-3 text-center text-[var(--color-text)]">$0</td>
                    <td className="py-3 text-center text-[var(--color-text)]">
                      From {PRO_FROM}/mo
                    </td>
                  </tr>
                  {[...FREE_FEATURES.map((f) => [f, true] as const), ...PRO_FEATURES.map((f) => [f, false] as const)].map(
                    ([feature, free]) => (
                      <tr key={feature} className="border-t border-[var(--color-border)]">
                        <th scope="row" className="px-4 py-3 font-normal text-[var(--color-text)] sm:px-5">
                          {feature}
                        </th>
                        <td className="py-3">
                          <Mark on={free} />
                        </td>
                        <td className="py-3">
                          <Mark on pro />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2
              id="faq-heading"
              data-reveal
              className={`${outfit} mb-10 text-3xl font-bold text-[var(--color-text)] md:text-4xl`}
            >
              Questions
            </h2>
            <div data-reveal-stagger className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] open:border-[var(--color-accent)]/50"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 focus-visible:rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] [&::-webkit-details-marker]:hidden">
                    <h3 className={`${outfit} text-lg font-semibold text-[var(--color-text)]`}>{faq.question}</h3>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200 group-open:rotate-180 group-open:text-[var(--color-accent)]"
                    />
                  </summary>
                  <p className="px-6 pb-6 leading-relaxed text-[var(--color-text-secondary)]">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </PageMotion>
      <SiteFooter />
    </>
  );
}
