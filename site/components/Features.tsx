"use client";

import { Lock, Mic, MessageSquare, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    icon: Lock,
    title: "Local & Private",
    description:
      "No cloud recording. Everything stays on your Mac — your meetings, your data.",
    accent: "var(--color-mint)",
  },
  {
    icon: Mic,
    title: "Real-time Transcription",
    description:
      "Live speech-to-text with automatic speaker identification. Know who said what.",
    accent: "var(--color-blue)",
  },
  {
    icon: MessageSquare,
    title: "AI Summaries & Chat",
    description:
      "Get instant summaries and ask follow-up questions about your meetings.",
    accent: "var(--color-magenta)",
  },
];

export function Features() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="font-[family-name:var(--font-syne)] text-4xl md:text-5xl font-bold text-center mb-16 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Built for focus
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="group relative p-8 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-transparent transition-all duration-300"
              whileHover={{
                boxShadow: `0 0 30px -5px ${feature.accent}33`,
                borderColor: `${feature.accent}44`,
              }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5"
                style={{ backgroundColor: `color-mix(in srgb, ${feature.accent} 15%, var(--color-bg))` }}
              >
                <feature.icon
                  className="w-6 h-6"
                  style={{ color: feature.accent }}
                />
              </div>
              <h3 className="font-[family-name:var(--font-syne)] text-xl font-bold mb-2 text-[var(--color-text)]">
                {feature.title}
              </h3>
              <p className="text-[var(--color-text-secondary)] text-base leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
