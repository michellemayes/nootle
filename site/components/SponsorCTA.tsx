"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";

export function SponsorCTA() {
  return (
    <section aria-label="Support Nootle" className="py-24 px-6">
      <motion.div
        className="max-w-2xl mx-auto text-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-12 md:px-16 md:py-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="font-[family-name:var(--font-outfit)] text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text)]">
          Support Nootle
        </h2>
        <p className="text-[var(--color-text-secondary)] text-base mb-8 max-w-md mx-auto">
          Nootle is free and open source. If it saves you time, consider
          supporting development.
        </p>
        <a
          href="https://github.com/sponsors/michellemayes"
          className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white rounded-full bg-[var(--color-sponsor)] hover:bg-[var(--color-sponsor-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sponsor)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
        >
          <Heart className="w-4 h-4 mr-2" fill="currentColor" />
          Sponsor on GitHub
        </a>
      </motion.div>
    </section>
  );
}
