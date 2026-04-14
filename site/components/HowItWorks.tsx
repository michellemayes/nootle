"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Join your meeting",
    description:
      "Nootle detects active meetings automatically — Zoom, Teams, Google Meet, and more.",
    color: "#22d3ee",
  },
  {
    number: "02",
    title: "Record & transcribe",
    description:
      "Real-time transcription with speaker diarization. Captures both your mic and system audio.",
    color: "#8b5cf6",
  },
  {
    number: "03",
    title: "Review & chat",
    description:
      "Browse transcripts, get AI summaries, and ask follow-up questions about anything discussed.",
    color: "#f472b6",
  },
  {
    number: "04",
    title: "Run workflows",
    description:
      "Automatically push notes to Slack, create Linear tickets, update Notion pages, or send email summaries.",
    color: "#34d399",
  },
];

export function HowItWorks() {
  return (
    <section aria-label="How it works" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.h2
          className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-16 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          How it works
        </motion.h2>

        <div className="space-y-12 relative">
          {/* Gradient connecting line */}
          <div
            className="absolute left-6 top-6 bottom-6 w-px opacity-40"
            style={{ background: "linear-gradient(to bottom, #22d3ee, #8b5cf6, #f472b6, #34d399)" }}
          />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="flex gap-8 items-start relative"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="font-[family-name:var(--font-outfit)] text-sm font-bold w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative z-10"
                style={{
                  backgroundColor: `${step.color}15`,
                  color: step.color,
                  border: `1px solid ${step.color}30`,
                  boxShadow: `0 0 20px -4px ${step.color}25`,
                }}
              >
                {step.number}
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-2 text-[var(--color-text)]">
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
