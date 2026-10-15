"use client";

import { ArrowRight, Heart } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { CopyCommand } from "@/components/CopyCommand";
import { DownloadButton } from "@/components/DownloadButton";
import { LiveDemo } from "@/components/LiveDemo";
import { EASE_OUT as ease } from "@/components/motion";
import { SPONSOR_URL } from "@/components/site-config";

export function Hero() {
  return (
    <section aria-label="Hero" className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-36">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[720px]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)",
        }}
      />

      <div className="max-w-5xl mx-auto text-center">
        <motion.a
          href="#live-assist"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="group inline-flex items-center gap-2 mb-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-1.5 pr-3 py-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-xs font-semibold text-white">New</span>
          Knowledge base &amp; Live Assist
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </motion.a>

        <motion.div
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="mb-6"
        >
          <motion.div
            className="mx-auto w-[88px] h-[88px]"
            whileHover={{ rotate: [0, -10, 8, -4, 0], transition: { duration: 0.6 } }}
          >
            <Image src="/nootle-icon.svg" alt="Nootle AI meeting recorder app icon" width={88} height={88} priority />
          </motion.div>
        </motion.div>

        <motion.h1
          className="font-[family-name:var(--font-outfit)] text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease }}
        >
          AI Meeting{" "}
          <span className="relative inline-block">
            Recorder
            <svg
              aria-hidden="true"
              viewBox="0 0 300 24"
              preserveAspectRatio="none"
              className="absolute left-0 -bottom-[0.12em] w-full h-[0.22em] overflow-visible"
            >
              <motion.path
                d="M4 16 C 60 6, 120 4, 170 10 S 260 20, 296 8"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="7"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: 0.7, ease: "easeInOut" }}
              />
            </svg>
          </span>{" "}
          for Mac
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-[var(--color-text-secondary)] mb-10 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease }}
        >
          Record any call without a bot, transcribe it on your Mac, and get
          summaries, action items, and answers from your meetings and docs, even
          live mid-call. Free and open source.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease }}
        >
          <DownloadButton />
          <a
            href={SPONSOR_URL}
            className="group inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-sponsor)] text-white hover:bg-[var(--color-sponsor-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_30px_-5px_var(--color-sponsor)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sponsor)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <Heart className="w-4 h-4 mr-2 transition-transform group-hover:scale-125" fill="currentColor" />
            Sponsor
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="mt-6 max-w-xl mx-auto"
        >
          <CopyCommand />
          <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
            macOS 14+ on Apple Silicon · MIT licensed · No account, no telemetry
          </p>
        </motion.div>

        <motion.div
          className="mt-16"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease }}
        >
          <LiveDemo />
        </motion.div>
      </div>
    </section>
  );
}
