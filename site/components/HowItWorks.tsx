"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Join your meeting",
    description:
      "Nootle detects active meetings automatically — Zoom, Teams, Google Meet, and more.",
    accent: "var(--color-mint)",
  },
  {
    number: "02",
    title: "Record & transcribe",
    description:
      "Real-time transcription with speaker labels. Captures both your mic and system audio.",
    accent: "var(--color-blue)",
  },
  {
    number: "03",
    title: "Review & chat",
    description:
      "Browse transcripts, get AI summaries, and ask follow-up questions about anything discussed.",
    accent: "var(--color-magenta)",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.h2
          className="font-[family-name:var(--font-syne)] text-4xl md:text-5xl font-bold text-center mb-16 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          How it works
        </motion.h2>

        <div className="space-y-12 relative">
          {/* Connecting line */}
          <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-[var(--color-mint)] via-[var(--color-blue)] to-[var(--color-magenta)] opacity-30" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="flex gap-8 items-start relative"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.15 }}
            >
              <div
                className="font-[family-name:var(--font-syne)] text-sm font-bold w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative z-10"
                style={{
                  backgroundColor: `color-mix(in srgb, ${step.accent} 15%, var(--color-bg))`,
                  color: step.accent,
                  border: `1px solid color-mix(in srgb, ${step.accent} 30%, transparent)`,
                }}
              >
                {step.number}
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-syne)] text-2xl font-bold mb-2 text-[var(--color-text)]">
                  {step.title}
                </h3>
                <p className="text-[var(--color-text-secondary)] text-base leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
