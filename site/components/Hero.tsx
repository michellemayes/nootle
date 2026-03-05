"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-20">
      {/* Animated color splashes */}
      <motion.div
        className="absolute top-[20%] left-[15%] w-[500px] h-[500px] -z-10 rounded-full blur-[120px]"
        style={{ background: "rgba(0, 255, 178, 0.15)" }}
        animate={{
          x: [0, 40, -20, 0],
          y: [0, -30, 20, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[30%] right-[10%] w-[400px] h-[400px] -z-10 rounded-full blur-[120px]"
        style={{ background: "rgba(59, 130, 246, 0.12)" }}
        animate={{
          x: [0, -30, 25, 0],
          y: [0, 25, -15, 0],
          scale: [1, 0.9, 1.08, 1],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[10%] left-[40%] w-[500px] h-[500px] -z-10 rounded-full blur-[120px]"
        style={{ background: "rgba(255, 45, 138, 0.15)" }}
        animate={{
          x: [0, -20, 35, 0],
          y: [0, -20, 10, 0],
          scale: [1, 1.05, 0.92, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
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
          Meetings on{" "}
          <span className="bg-gradient-to-r from-[var(--color-mint)] via-[var(--color-blue)] to-[var(--color-magenta)] bg-clip-text text-transparent">autopilot</span>
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
            <Heart className="w-4 h-4 mr-2" fill="currentColor" />
            Sponsor
          </a>
        </motion.div>
      </div>
    </section>
  );
}
