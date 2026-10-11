"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { AppleLogo } from "@/components/AppleLogo";

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
            className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_30px_-5px_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <AppleLogo className="w-4 h-4 mr-2" />
            Download for Mac
          </a>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-sponsor)] text-white hover:bg-[var(--color-sponsor-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_30px_-5px_var(--color-sponsor)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sponsor)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <Heart className="w-4 h-4 mr-2" fill="currentColor" />
            Sponsor
          </a>
        </motion.div>
      </div>
    </section>
  );
}
