"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { EASE_OUT } from "@/components/motion";

const steps = [
  {
    title: "Join your call",
    description:
      "Turn on Auto-detect meetings and a small pop-up offers to record when a call starts on Zoom, Teams, Webex, Slack, FaceTime, Discord, or a browser call like Google Meet, even with Nootle's window closed. Or hit Record on the event in Up next, or press ⌘N from anywhere.",
    color: "#22d3ee",
  },
  {
    title: "Record and transcribe",
    description:
      "Your microphone and the call's audio are transcribed on your Mac as people talk. Speakers are told apart and, once you've named them, recognised by voice next time. Jot shorthand notes as you go; they save as you type.",
    color: "#8b5cf6",
  },
  {
    title: "Get help in the moment",
    description:
      "Live Assist answers questions from your documents and past meetings while the call is still going. Zoned out? “What did I miss?” recaps the last five minutes and anything asked of you.",
    color: "#a78bfa",
  },
  {
    title: "Review and ask",
    description:
      "When the call ends, Nootle summarizes it, expands your notes, and pulls out decisions and action items with owners. Ask anything across every meeting and document, with citations that jump to the moment.",
    color: "#f472b6",
  },
  {
    title: "Send it where it belongs",
    description:
      "Workflows post summaries to Slack, file Linear, GitHub, or Asana tickets, update Notion or Confluence, save Markdown to Obsidian, or email a recap. Run them with one click or on every meeting.",
    color: "#34d399",
  },
];

export function HowItWorks() {
  const listRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 75%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  return (
    <section id="how-it-works" aria-label="How Nootle works" className="py-24 px-6 scroll-mt-16">
      <div className="max-w-3xl mx-auto">
        <div data-reveal>
          <h2 className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-16 text-[var(--color-text)]">
            How Nootle works
          </h2>
        </div>

        <div ref={listRef} className="relative">
          <div aria-hidden="true" className="absolute left-6 top-6 bottom-6 w-px bg-[var(--color-border)]" />
          <motion.div
            aria-hidden="true"
            className="absolute left-6 top-6 bottom-6 w-px origin-top"
            style={{
              scaleY: progress,
              background: `linear-gradient(to bottom, ${steps.map((s) => s.color).join(", ")})`,
            }}
          />

          <ol className="space-y-12 relative">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-8 items-start relative">
                <motion.div
                  className="font-[family-name:var(--font-outfit)] text-sm font-bold w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative z-10 bg-[var(--color-bg)]"
                  initial={{ scale: 0.6, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, margin: "-30% 0px" }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  style={{
                    color: step.color,
                    border: `1px solid ${step.color}50`,
                    boxShadow: `inset 0 0 0 100px ${step.color}15`,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-30% 0px" }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                >
                  <h3 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-2 text-[var(--color-text)]">
                    {step.title}
                  </h3>
                  <p className="text-[var(--color-text-secondary)] text-base leading-relaxed">{step.description}</p>
                </motion.div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
