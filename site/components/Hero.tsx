"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-20">
      {/* Spotlight glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] -z-10 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgba(0, 255, 178, 0.08) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="mx-auto w-[120px] h-[120px] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-[var(--color-border)]">
            <Image
              src="/nootle-logo.png"
              alt="Nootle"
              width={120}
              height={120}
              priority
            />
          </div>
        </motion.div>

        <motion.h1
          className="font-[family-name:var(--font-syne)] text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Meetings,{" "}
          <span className="text-[var(--color-mint)]">captured</span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-[var(--color-text-secondary)] mb-10 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          AI-powered meeting recorder for Mac. Real-time transcription, speaker
          identification, and AI chat. All local, all private.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <a
            href="https://github.com/michellemayes/nootle/releases"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-mint)] text-[var(--color-bg)] hover:opacity-90 transition-opacity"
          >
            Download for Mac
          </a>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5z"
              />
            </svg>
            Sponsor
          </a>
        </motion.div>
      </div>
    </section>
  );
}
