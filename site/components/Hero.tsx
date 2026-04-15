"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

export function Hero() {
  return (
    <section aria-label="Hero" className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-20">
      {/* Mesh gradient background */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div
          className="absolute top-[10%] left-[20%] w-[600px] h-[600px] rounded-full blur-[160px] opacity-20"
          style={{ background: "var(--color-accent)" }}
        />
        <div
          className="absolute top-[30%] right-[10%] w-[500px] h-[500px] rounded-full blur-[140px] opacity-10"
          style={{ background: "var(--color-cyan)" }}
        />
        <div
          className="absolute bottom-[10%] left-[40%] w-[500px] h-[500px] rounded-full blur-[160px] opacity-10"
          style={{ background: "var(--color-sponsor)" }}
        />
      </div>

      <div className="max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <div className="mx-auto w-[120px] h-[120px] flex items-center justify-center">
            <Image
              src="/nootle-icon.svg"
              alt="Nootle AI meeting recorder app icon"
              width={120}
              height={120}
              priority
            />
          </div>
        </motion.div>

        <motion.h1
          className="font-[family-name:var(--font-outfit)] text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          AI Meeting{" "}
          <span
            className="bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-cyan)] to-[var(--color-accent)] bg-[length:200%_auto] bg-clip-text text-transparent"
            style={{ animation: "shimmer 3s ease-in-out infinite" }}
          >
            Recorder
          </span>
          {" "}for Mac
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-[var(--color-text-secondary)] mb-10 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          AI-powered meeting recorder for Mac. Real-time transcription, speaker
          identification, and AI chat. All local, all private.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <a
            href="https://github.com/michellemayes/nootle/releases"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-all duration-200 hover:shadow-[0_0_30px_-5px_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <svg aria-hidden="true" className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 814.37 1000"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.5-81.6-105.6-207-105.6-326.4 0-192 124.7-293.8 247.5-293.8 65.2 0 119.6 42.8 160.4 42.8 39.5 0 101.1-45.4 176.3-45.4 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8.6 15.6 1.3 18.2 2.6.6 6.4 1.3 10.2 1.3 45.4 0 103-30.4 139.5-71.4z"/></svg>
            Download for Mac
          </a>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-sponsor)] text-white hover:bg-[var(--color-sponsor-hover)] transition-all duration-200 hover:shadow-[0_0_30px_-5px_var(--color-sponsor)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sponsor)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <Heart className="w-4 h-4 mr-2" fill="currentColor" />
            Sponsor
          </a>
        </motion.div>
      </div>
    </section>
  );
}
