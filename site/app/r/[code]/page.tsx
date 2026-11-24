import type { Metadata } from "next";
import { ArrowRight, Gift } from "lucide-react";
import Link from "next/link";
import { Doodles, Squiggle } from "@/components/Doodles";
import { DownloadButton } from "@/components/DownloadButton";
import { landingMetadata } from "@/components/LandingPage";
import { Navbar } from "@/components/Navbar";
import { PageMotion } from "@/components/PageMotion";
import { SiteFooter } from "@/components/SiteFooter";
import { outfit } from "@/components/site-config";
import { secondaryButton } from "@/components/ui";
import { REFERRAL_DISCOUNT_PERCENT, TRIAL_DAYS } from "@/lib/account/plans";
import { validReferralCode } from "@/lib/referral-offer";

type Props = { params: Promise<{ code: string }> };

const OFFER_TITLE = `${REFERRAL_DISCOUNT_PERCENT}% off Nootle Pro, from a friend`;

const REASONS = [
  {
    title: "No bot in the call",
    body: "Nootle records your Mac's audio directly, so nobody sees an extra participant join.",
  },
  {
    title: "Stays on your Mac",
    body: "Transcription runs on-device. Audio is never uploaded, and your notes are plain files you own.",
  },
  {
    title: "Free and open source",
    body: `Recording, summaries and Ask are free forever under the MIT license. Pro starts with a ${TRIAL_DAYS}-day trial.`,
  },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const valid = await validReferralCode(code);
  const base = landingMetadata({
    path: `/r/${code}`,
    title: valid ? OFFER_TITLE : "Nootle - AI Meeting Recorder for Mac",
    description: valid
      ? `You've been invited to Nootle, the open-source AI notetaker for Mac with no bot in your calls. Get ${REFERRAL_DISCOUNT_PERCENT}% off your first Pro payment.`
      : "Nootle is the open-source AI notetaker for Mac. No bot in your calls, transcription on your Mac, and free forever.",
  });
  return { ...base, alternates: { canonical: "/" }, robots: { index: false, follow: true } };
}

export default async function ReferralPage({ params }: Props) {
  const valid = await validReferralCode((await params).code);

  return (
    <>
      <noscript>
        <style>{"[data-hero],[data-wiggle],[data-doodle]{opacity:1}[data-squiggle] path{stroke-dashoffset:0}"}</style>
      </noscript>
      <Navbar />
      <PageMotion id="main-content" className="relative overflow-hidden">
        <section aria-labelledby="invite-heading" className="relative px-6 pt-36 pb-20">
          <div
            aria-hidden="true"
            data-parallax
            className="absolute inset-x-0 top-0 -z-10 h-[620px]"
            style={{
              background:
                "radial-gradient(55% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)",
            }}
          />
          <Doodles />
          <div className="mx-auto max-w-3xl text-center">
            {valid && (
              <p
                data-wiggle
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-4 py-1.5 text-sm font-semibold text-[var(--color-text)]"
              >
                <Gift aria-hidden="true" className="h-4 w-4 text-[var(--color-accent)]" />A friend invited you
              </p>
            )}
            <h1
              id="invite-heading"
              data-hero
              className={`${outfit} mb-6 text-5xl font-extrabold tracking-tight text-[var(--color-text)] md:text-7xl`}
            >
              {valid ? (
                <>
                  {REFERRAL_DISCOUNT_PERCENT}% off Nootle <Squiggle>Pro</Squiggle>
                </>
              ) : (
                <>
                  Meeting notes that stay on your <Squiggle>Mac</Squiggle>
                </>
              )}
            </h1>
            <p data-hero className="mx-auto mb-10 max-w-xl text-lg text-[var(--color-text-secondary)] md:text-xl">
              {valid
                ? "The open-source AI notetaker for Mac. Your discount is saved and applies at checkout."
                : "The open-source AI notetaker for Mac. No bot in your calls."}
            </p>
            <div data-hero data-jelly className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <DownloadButton />
              <Link href="/pricing" className={`${secondaryButton} group px-8 py-4 text-base`}>
                See pricing
                <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>

        <section aria-label="Why Nootle" className="px-6 pb-24">
          <ol data-reveal-stagger className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3 md:gap-8">
            {REASONS.map((reason, i) => (
              <li key={reason.title} className="grid grid-cols-[2.5rem_1fr] gap-3 md:block">
                <span
                  aria-hidden="true"
                  data-pop
                  className={`${outfit} inline-block text-2xl font-bold tabular-nums text-[var(--color-accent)] md:mb-3`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className={`${outfit} mb-2 text-xl font-bold text-[var(--color-text)]`}>{reason.title}</h2>
                  <p className="leading-relaxed text-[var(--color-text-secondary)]">{reason.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Nootle on a Mac" className="px-6 pb-24">
          <figure data-reveal className="mx-auto max-w-5xl">
            <picture>
              <img
                src="/screenshots/meeting-dark-1600.webp"
                srcSet="/screenshots/meeting-dark-800.webp 800w, /screenshots/meeting-dark-1600.webp 1600w"
                sizes="(max-width: 1100px) 100vw, 64rem"
                alt="A meeting in Nootle: the speaker-labelled transcript beside its AI summary"
                width={1600}
                height={1060}
                loading="lazy"
                className="h-auto w-full rounded-2xl border border-[var(--color-border)] shadow-[0_40px_100px_-40px_rgb(0_0_0/0.9)]"
              />
            </picture>
          </figure>
        </section>
      </PageMotion>
      <SiteFooter />
    </>
  );
}
