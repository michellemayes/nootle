"use client";

import { Lock, Mic, MessageSquare, Lightbulb, Search, Volume2, Zap, SquareKanban, Terminal, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  span?: string;
}[] = [
  {
    icon: Lock,
    title: "Local & Private",
    description:
      "No cloud recording. Everything stays on your Mac — your meetings, your data.",
    color: "#34d399",
    span: "md:col-span-2",
  },
  {
    icon: Mic,
    title: "Real-time Transcription",
    description:
      "Live speech-to-text with automatic speaker identification. Know who said what.",
    color: "#22d3ee",
    span: "md:col-span-2",
  },
  {
    icon: MessageSquare,
    title: "AI Summaries & Chat",
    description:
      "Get instant summaries and ask follow-up questions about your meetings.",
    color: "#8b5cf6",
  },
  {
    icon: Lightbulb,
    title: "Smart Insights",
    description:
      "Automatically extract decisions, action items, and key moments from every meeting.",
    color: "#fbbf24",
  },
  {
    icon: Search,
    title: "Search Across Meetings",
    description:
      "Ask questions across your entire meeting history with AI-powered semantic search.",
    color: "#f472b6",
  },
  {
    icon: Volume2,
    title: "Noise Cancellation",
    description:
      "Built-in noise reduction for cleaner audio and more accurate transcriptions.",
    color: "#22d3ee",
  },
  {
    icon: Zap,
    title: "Auto-Detection",
    description:
      "Nootle detects when you join Zoom, Teams, or Meet and offers to start recording.",
    color: "#fbbf24",
    span: "md:col-span-2",
  },
  {
    icon: SquareKanban,
    title: "Linear Integration",
    description:
      "Turn action items into Linear tickets with one click.",
    color: "#5E6AD2",
  },
  {
    icon: Terminal,
    title: "CLI & Developer Tools",
    description:
      "Query your meetings from the terminal. MCP server for AI assistant integration.",
    color: "#34d399",
  },
];

export function Features() {
  return (
    <section aria-label="Features" className="py-24 px-6 bg-[var(--color-surface)]">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-4 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Built for focus
        </motion.h2>
        <motion.p
          className="text-center text-[var(--color-text-secondary)] text-lg mb-16 max-w-lg mx-auto"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Everything you need to capture, understand, and act on your meetings.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className={`group relative p-7 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] overflow-hidden transition-all duration-300 hover:-translate-y-1 ${feature.span || ""}`}
              style={{
                boxShadow: "0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.03) inset",
              }}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{
                boxShadow: `0 8px 30px -8px ${feature.color}30, 0 0 0 1px ${feature.color}20 inset`,
              }}
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${feature.color}40, transparent)` }}
              />
              <div
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
                style={{ backgroundColor: `${feature.color}15` }}
              >
                <feature.icon
                  className="w-5 h-5"
                  style={{ color: feature.color }}
                />
              </div>
              <h3 className="font-[family-name:var(--font-outfit)] text-lg font-bold mb-2 text-[var(--color-text)]">
                {feature.title}
              </h3>
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
