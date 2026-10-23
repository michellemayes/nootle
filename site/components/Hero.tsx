import { ArrowRight, Heart } from "lucide-react";
import Image from "next/image";
import { CopyCommand } from "@/components/CopyCommand";
import { Doodles, Squiggle } from "@/components/Doodles";
import { DownloadButton } from "@/components/DownloadButton";
import { LiveDemo } from "@/components/LiveDemo";
import { SPONSOR_URL } from "@/components/site-config";

export function Hero() {
  return (
    <section aria-label="Hero" className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-36">
      <div
        aria-hidden="true"
        data-parallax
        className="absolute inset-x-0 top-0 -z-10 h-[720px]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)",
        }}
      />
      <Doodles mascot={false} />

      <div className="max-w-5xl mx-auto text-center">
        <a
          href="#live-assist"
          data-wiggle
          className="group inline-flex items-center gap-2 mb-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-1.5 pr-3 py-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-xs font-semibold text-white">New</span>
          Knowledge base &amp; Live Assist
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </a>

        <div className="mb-6">
          <div data-wiggle className="mx-auto w-[88px] h-[88px]">
            <Image src="/nootle-icon.svg" alt="Nootle AI meeting recorder app icon" width={88} height={88} priority />
          </div>
        </div>

        <h1
          data-hero
          className="font-[family-name:var(--font-outfit)] text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 text-[var(--color-text)]"
        >
          AI Meeting <Squiggle>Recorder</Squiggle> for Mac
        </h1>

        <p data-hero className="text-lg md:text-xl text-[var(--color-text-secondary)] mb-10 max-w-2xl mx-auto">
          Record any call without a bot, transcribe it on your Mac, and get
          summaries, action items, and answers from your meetings and docs, even
          live mid-call. Free and open source.
        </p>

        <div data-hero data-jelly className="flex flex-col sm:flex-row gap-4 justify-center">
          <DownloadButton />
          <a
            href={SPONSOR_URL}
            className="group inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-sponsor)] text-white hover:bg-[var(--color-sponsor-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_30px_-5px_var(--color-sponsor)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sponsor)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <Heart className="w-4 h-4 mr-2 transition-transform group-hover:scale-125" fill="currentColor" />
            Sponsor
          </a>
        </div>

        <div data-hero className="mt-6 max-w-xl mx-auto">
          <CopyCommand />
          <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
            macOS 14+ on Apple Silicon · MIT licensed · No account, no telemetry
          </p>
        </div>

        <div data-hero className="mt-16">
          <LiveDemo />
        </div>
      </div>
    </section>
  );
}
