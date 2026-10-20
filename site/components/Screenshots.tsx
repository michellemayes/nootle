"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { AnimateIn } from "@/components/AnimateIn";
import { EASE_OUT } from "@/components/motion";

const SHOTS = [
  {
    id: "library",
    label: "Meetings",
    caption: "Every meeting in one library — searchable, labelled, and summarized.",
    alt: "Nootle meeting library showing recorded meetings with labels, dates, and durations",
  },
  {
    id: "recording",
    label: "Recording",
    caption: "Record mic and system audio while the transcript builds in real time.",
    alt: "Nootle recording a meeting with live transcript and notes",
  },
  {
    id: "meeting",
    label: "Transcript & summary",
    caption: "Speaker-labelled transcript beside an AI summary you can jump around in.",
    alt: "Nootle meeting detail with the transcript on the left and an AI summary on the right",
  },
  {
    id: "insights",
    label: "Insights",
    caption: "Decisions, action items, and key moments pulled out of every meeting.",
    alt: "Nootle insights dashboard listing decisions and action items across meetings",
  },
  {
    id: "chat",
    label: "Chat",
    caption: "Ask questions across your whole meeting history, with citations.",
    alt: "Nootle chat answering a question about onboarding drop-off with sources cited",
  },
  {
    id: "automations",
    label: "Automations",
    caption: "Templates and workflows so the right summary runs on its own.",
    alt: "Nootle automations page showing summary templates",
  },
] as const;

const AUTOPLAY_MS = 5000;

function ShotFigure({ shot }: { shot: (typeof SHOTS)[number] }) {
  return (
    <figure>
      <Image
        src={`/screenshots/${shot.id}-dark.png`}
        alt={shot.alt}
        width={1600}
        height={1060}
        priority={shot.id === "library"}
        className="w-full h-auto"
      />
      <figcaption className="mt-4 text-center text-[var(--color-text-secondary)]">{shot.caption}</figcaption>
    </figure>
  );
}

export function Screenshots() {
  const [index, setIndex] = useState(0);
  // Tours the tabs on its own until the visitor picks one.
  const [autoplay, setAutoplay] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.4 });
  const reduce = useReducedMotion();
  const playing = autoplay && inView && !reduce;
  const shot = SHOTS[index];

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setIndex((index + 1) % SHOTS.length), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [playing, index]);

  return (
    <section ref={sectionRef} aria-label="Screenshots" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-4 text-[var(--color-text)]">
            See it in action
          </h2>
          <p className="text-xl text-[var(--color-text-secondary)] text-center mb-10 max-w-2xl mx-auto">
            Record meetings, get transcripts with speaker labels, then let AI surface what matters.
          </p>
        </AnimateIn>

        <div
          role="tablist"
          aria-label="App screenshots"
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {SHOTS.map((s, i) => {
            const selected = i === index;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={selected}
                aria-controls={`screenshot-${s.id}`}
                onClick={() => {
                  setAutoplay(false);
                  setIndex(i);
                }}
                className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                  selected
                    ? "text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]"
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="screenshot-tab"
                    className="absolute inset-0 rounded-full bg-[var(--color-accent)]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {selected && playing && (
                  <span aria-hidden="true" className="absolute inset-x-4 bottom-1 h-0.5 overflow-hidden rounded-full">
                    <motion.span
                      key={`progress-${s.id}`}
                      className="block h-full w-full origin-left bg-white/70"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                    />
                  </span>
                )}
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
        </div>

        <AnimateIn delay={0.1} className="relative mx-auto max-w-5xl">
          {/* Every panel stays in the HTML, inactive ones hidden, so crawlers and agents read each caption and alt text. */}
          {SHOTS.map((s) => {
            const selected = s.id === shot.id;
            return (
              <motion.div
                key={s.id}
                id={`screenshot-${s.id}`}
                role="tabpanel"
                hidden={!selected}
                initial={false}
                animate={selected ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                <ShotFigure shot={s} />
              </motion.div>
            );
          })}

          {/* Layered glow behind the screenshot */}
          <div
            aria-hidden="true"
            className="absolute -inset-8 -z-10 rounded-3xl opacity-20 blur-[60px]"
            style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-cyan))" }}
          />
        </AnimateIn>
      </div>
    </section>
  );
}
