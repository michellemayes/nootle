"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";

export function SponsorCTA() {
  return (
    <section className="py-24 px-6">
      <motion.div
        className="max-w-2xl mx-auto text-center relative rounded-2xl p-[1px]"
        style={{
          background:
            "linear-gradient(135deg, var(--color-mint), var(--color-blue), var(--color-magenta))",
        }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-[var(--color-surface)] rounded-2xl px-8 py-12 md:px-16 md:py-16">
          <h2 className="font-[family-name:var(--font-syne)] text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text)]">
            Support Nootle
          </h2>
          <p className="text-[var(--color-text-secondary)] text-base mb-8 max-w-md mx-auto">
            Nootle is free and open source. If it saves you time, consider
            supporting development.
          </p>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-[var(--color-bg)] rounded-full bg-[var(--color-mint)] hover:opacity-90 transition-opacity"
          >
            <Heart className="w-4 h-4 mr-2" fill="currentColor" />
            Sponsor on GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}
