"use client";

import { Lock, Mic, MessageSquare, Lightbulb, Search, Volume2, Zap, SquareKanban, Terminal, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Lock,
    title: "Local & Private",
    description:
      "No cloud recording. Everything stays on your Mac — your meetings, your data.",
  },
  {
    icon: Mic,
    title: "Real-time Transcription",
    description:
      "Live speech-to-text with automatic speaker identification. Know who said what.",
  },
  {
    icon: MessageSquare,
    title: "AI Summaries & Chat",
    description:
      "Get instant summaries and ask follow-up questions about your meetings.",
  },
  {
    icon: Lightbulb,
    title: "Smart Insights",
    description:
      "Automatically extract decisions, action items, and key moments from every meeting.",
  },
  {
    icon: Search,
    title: "Search Across Meetings",
    description:
      "Ask questions across your entire meeting history with AI-powered semantic search.",
  },
  {
    icon: Volume2,
    title: "Noise Cancellation",
    description:
      "Built-in noise reduction for cleaner audio and more accurate transcriptions.",
  },
  {
    icon: Zap,
    title: "Auto-Detection",
    description:
      "Nootle detects when you join Zoom, Teams, or Meet and offers to start recording.",
  },
  {
    icon: SquareKanban,
    title: "Linear Integration",
    description:
      "Turn action items into Linear tickets with one click.",
  },
  {
    icon: Terminal,
    title: "CLI & Developer Tools",
    description:
      "Query your meetings from the terminal. MCP server for AI assistant integration.",
  },
];

export function Features() {
  return (
    <section aria-label="Features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-16 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Built for focus
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="group relative p-8 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 transition-colors duration-200"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5"
                style={{ backgroundColor: "var(--color-accent-subtle)" }}
              >
                <feature.icon
                  className="w-6 h-6 text-[var(--color-accent)]"
                />
              </div>
              <h3 className="font-[family-name:var(--font-outfit)] text-xl font-bold mb-2 text-[var(--color-text)]">
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
