"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "1",
    title: "Join your meeting",
    description: "Nootle detects active meetings automatically — Zoom, Teams, Google Meet, and more.",
    color: "#4EEABB",
  },
  {
    number: "2",
    title: "Record & transcribe",
    description: "Real-time transcription with speaker labels. Captures both your mic and system audio.",
    color: "#C084FC",
  },
  {
    number: "3",
    title: "Review & chat",
    description: "Browse transcripts, get AI summaries, and ask follow-up questions about anything discussed.",
    color: "#E879A8",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-center mb-16"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          How it works
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-[#4EEABB] via-[#C084FC] to-[#E879A8]" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="text-center relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.15 }}
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold text-white mb-6 relative z-10"
                style={{ backgroundColor: step.color }}
              >
                {step.number}
              </div>
              <h3
                className="text-2xl font-bold mb-3"
                style={{ color: "var(--color-text)" }}
              >
                {step.title}
              </h3>
              <p className="text-gray-600 text-lg max-w-xs mx-auto">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
