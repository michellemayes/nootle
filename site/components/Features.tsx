"use client";

import { Lock, Mic, MessageSquare, Monitor, Lightbulb, Search, Volume2, Zap, SquareKanban, Terminal, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: string;
}[] = [
  {
    icon: Lock,
    title: "Local & Private",
    description:
      "No cloud recording. Everything stays on your Mac — your meetings, your data.",
    gradient: "from-[#4EEABB] to-[#5BC4A8]",
  },
  {
    icon: Mic,
    title: "Real-time Transcription",
    description:
      "Live speech-to-text with automatic speaker identification. Know who said what.",
    gradient: "from-[#C084FC] to-[#A855F7]",
  },
  {
    icon: MessageSquare,
    title: "AI Summaries & Chat",
    description:
      "Get instant summaries and ask follow-up questions about your meetings.",
    gradient: "from-[#E879A8] to-[#C084FC]",
  },
  {
    icon: Monitor,
    title: "Works with Any Meeting App",
    description:
      "Zoom, Teams, Google Meet, and more. Nootle captures audio from any app.",
    gradient: "from-[#5BC4A8] to-[#4EEABB]",
  },
  {
    icon: Lightbulb,
    title: "Smart Insights",
    description:
      "Automatically extract decisions, action items, and key moments from every meeting.",
    gradient: "from-[#F59E0B] to-[#D97706]",
  },
  {
    icon: Search,
    title: "Search Across Meetings",
    description:
      "Ask questions across your entire meeting history with AI-powered semantic search.",
    gradient: "from-[#3B82F6] to-[#2563EB]",
  },
  {
    icon: Volume2,
    title: "Noise Cancellation",
    description:
      "Built-in noise reduction for cleaner audio and more accurate transcriptions.",
    gradient: "from-[#10B981] to-[#059669]",
  },
  {
    icon: Zap,
    title: "Auto-Detection",
    description:
      "Nootle detects when you join Zoom, Teams, or Meet and offers to start recording.",
    gradient: "from-[#F97316] to-[#EA580C]",
  },
  {
    icon: SquareKanban,
    title: "Linear Integration",
    description:
      "Turn action items into Linear tickets with one click.",
    gradient: "from-[#8B5CF6] to-[#7C3AED]",
  },
  {
    icon: Terminal,
    title: "CLI & Developer Tools",
    description:
      "Query your meetings from the terminal. MCP server for AI assistant integration.",
    gradient: "from-[#6366F1] to-[#4F46E5]",
  },
];

export function Features() {
  return (
    <section className="py-24 px-6" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-center mb-16"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Everything you need from a meeting recorder
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="relative p-8 rounded-3xl bg-white shadow-sm hover:shadow-lg transition-shadow border border-gray-100"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} mb-4`}
              >
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--color-text)" }}
              >
                {feature.title}
              </h3>
              <p className="text-gray-600 text-lg">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
