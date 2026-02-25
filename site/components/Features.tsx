"use client";

import { motion } from "framer-motion";

const features = [
  {
    icon: "🔒",
    title: "Local & Private",
    description:
      "No cloud recording. Everything stays on your Mac — your meetings, your data.",
    gradient: "from-[#4EEABB] to-[#5BC4A8]",
  },
  {
    icon: "🎙️",
    title: "Real-time Transcription",
    description:
      "Live speech-to-text with automatic speaker identification. Know who said what.",
    gradient: "from-[#C084FC] to-[#A855F7]",
  },
  {
    icon: "💬",
    title: "AI Summaries & Chat",
    description:
      "Get instant summaries and ask follow-up questions about your meetings.",
    gradient: "from-[#E879A8] to-[#C084FC]",
  },
  {
    icon: "🖥️",
    title: "Works with Any Meeting App",
    description:
      "Zoom, Teams, Google Meet, and more. Nootle captures audio from any app.",
    gradient: "from-[#5BC4A8] to-[#4EEABB]",
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} text-2xl mb-4`}
              >
                {feature.icon}
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
