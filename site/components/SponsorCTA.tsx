"use client";

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
            Sponsor on GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}
