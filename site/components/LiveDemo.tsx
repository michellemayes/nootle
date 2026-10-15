"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CheckSquare, FileText, Sparkles, Video } from "lucide-react";
import { useLoopStep } from "@/components/useLoopStep";

/* A looping, scripted mock of Nootle mid-call: the transcript builds, speakers
   get named from their voices, and Live Assist answers a question from the
   team's docs. Each `at` is the step it appears on. */

const STEPS = 11;
const STEP_MS = 1700;

type Speaker = { label: string; name?: string; namedAt?: number; color: string };

const YOU: Speaker = { label: "You", color: "var(--color-accent)" };
const PRIYA: Speaker = { label: "Speaker 2", name: "Priya", namedAt: 3, color: "var(--color-cyan)" };
const SAM: Speaker = { label: "Speaker 3", name: "Sam", namedAt: 7, color: "var(--color-amber)" };

const LINES: { at: number; time: string; speaker: Speaker; text: string }[] = [
  { at: 1, time: "12:31", speaker: YOU, text: "Okay, let's run through the launch checklist." },
  { at: 2, time: "12:36", speaker: PRIYA, text: "Before that: what did Acme's pilot team say about SSO?" },
  { at: 5, time: "12:52", speaker: YOU, text: "Right, SAML is the blocker. Sam, can you take it?" },
  { at: 6, time: "12:58", speaker: SAM, text: "On it. I'll have a plan by Friday." },
];

const QUESTION_AT = 3;
const ANSWER_AT = 4;
const ACTION_AT = 8;

export function LiveDemo() {
  const { ref, step, reduce } = useLoopStep(STEPS, STEP_MS);
  const elapsed = useElapsed(749, !reduce);
  const visible = LINES.filter((l) => step >= l.at);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Nootle recording a call: the live transcript names speakers from their voices, and Live Assist answers a question about the Acme pilot from the team's documents."
      className="relative mx-auto max-w-4xl text-left"
    >
      <div
        aria-hidden="true"
        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        {/* Title bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/60">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)] min-w-0">
            <Video className="w-4 h-4 shrink-0 text-[var(--color-text-secondary)]" />
            <span className="truncate">Product sync</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Meter label="Mic" seed={0} />
            <Meter label="Call" seed={3} />
            <div className="flex items-center gap-1.5 rounded-full bg-[#ef4444]/15 px-2.5 py-1 text-xs font-semibold text-[#f87171] tabular-nums">
              <span className="rec-dot w-2 h-2 rounded-full bg-[#ef4444]" />
              {formatTime(elapsed)}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-[1.35fr_1fr]">
          {/* Transcript */}
          <div className="p-5 h-[19rem] md:h-[17.5rem] flex flex-col justify-end overflow-hidden border-b md:border-b-0 md:border-r border-[var(--color-border)]">
            <p className="mb-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Live transcript
            </p>
            <ul className="space-y-3.5">
              <AnimatePresence initial={false}>
                {visible.length === 0 && (
                  <motion.li
                    key="listening"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-[var(--color-text-secondary)]"
                  >
                    Listening<Dots />
                  </motion.li>
                )}
                {visible.map((line, i) => (
                  <motion.li
                    key={line.time}
                    layout={!reduce}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="text-sm leading-snug"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <SpeakerName speaker={line.speaker} step={step} />
                      <span className="text-[11px] tabular-nums text-[var(--color-text-secondary)]">{line.time}</span>
                    </div>
                    <p className="text-[var(--color-text)]">
                      <Typewriter text={line.text} animate={!reduce} highlight={line.speaker === PRIYA && step >= QUESTION_AT} />
                      {!reduce && i === visible.length - 1 && <span className="caret ml-0.5 text-[var(--color-accent)]">▍</span>}
                    </p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>

          {/* Live Assist */}
          <div className="p-5 h-[17.5rem] flex flex-col gap-3 bg-[var(--color-bg)]/40">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                Live Assist
              </p>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
                Auto
                <span className="relative w-6 h-3.5 rounded-full bg-[var(--color-accent)]">
                  <span className="absolute right-0.5 top-0.5 w-2.5 h-2.5 rounded-full bg-white" />
                </span>
              </span>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              {step < QUESTION_AT && (
                <motion.p
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-[var(--color-text-secondary)]"
                >
                  Listening for questions your docs can answer<Dots />
                </motion.p>
              )}
              {step === QUESTION_AT && (
                <motion.p
                  key="searching"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-[var(--color-text-secondary)]"
                >
                  Searching 214 documents and 38 meetings<Dots />
                </motion.p>
              )}
              {step >= ANSWER_AT && (
                <motion.div
                  key="answer"
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  className="rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-surface-elevated)] p-3.5"
                >
                  <p className="text-[11px] text-[var(--color-text-secondary)] mb-1">
                    &ldquo;What did Acme&apos;s pilot team say about SSO?&rdquo;
                  </p>
                  <p className="text-sm text-[var(--color-text)] leading-snug">
                    They need SAML single sign-on through Okta before a company-wide rollout.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Source>Acme pilot notes.pdf · p. 3</Source>
                    <Source>Acme check-in · Sep 30</Source>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {step >= ACTION_AT && (
                <motion.div
                  key="action"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="mt-auto flex items-center gap-2 rounded-lg border border-[var(--color-emerald)]/30 bg-[var(--color-emerald)]/10 px-3 py-2 text-xs text-[var(--color-text)]"
                >
                  <CheckSquare className="w-4 h-4 shrink-0 text-[var(--color-emerald)]" />
                  <span>
                    Action item: SAML plan · <strong className="font-semibold">Sam</strong> · due Fri
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeakerName({ speaker, step }: { speaker: Speaker; step: number }) {
  const named = speaker.name && speaker.namedAt !== undefined && step >= speaker.namedAt;
  return (
    <span className="relative inline-flex items-center gap-1 text-xs font-semibold" style={{ color: speaker.color }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={named ? "name" : "label"}
          initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          transition={{ duration: 0.3 }}
          className="inline-flex items-center gap-1"
        >
          {named ? speaker.name : speaker.label}
          {named && <BadgeCheck className="w-3.5 h-3.5" />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Typewriter({ text, animate, highlight }: { text: string; animate: boolean; highlight: boolean }) {
  const [count, setCount] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) clearInterval(id);
        return Math.min(c + 1, text.length);
      });
    }, 24);
    return () => clearInterval(id);
  }, [animate, text]);

  return (
    <span
      className={`rounded transition-colors duration-500 ${highlight ? "bg-[var(--color-accent)]/20" : ""}`}
    >
      {text.slice(0, count)}
      <span className="opacity-0">{text.slice(count)}</span>
    </span>
  );
}

function Meter({ label, seed }: { label: string; seed: number }) {
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
      {label}
      <span className="flex items-end gap-[2px] h-3.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="wave-bar w-[3px] h-full rounded-full bg-[var(--color-emerald)]"
            style={{
              animationDelay: `${-((i + seed) * 0.17)}s`,
              animationDuration: `${0.8 + ((i * 7 + seed) % 5) * 0.12}s`,
            }}
          />
        ))}
      </span>
    </div>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
      <FileText className="w-3 h-3" />
      {children}
    </span>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="rec-dot w-1 h-1 rounded-full bg-current" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  );
}

function useElapsed(start: number, running: boolean) {
  const [seconds, setSeconds] = useState(start);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}

function formatTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
