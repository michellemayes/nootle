"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  BarChart3,
  Camera,
  Check,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Lock,
  Presentation,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLoopStep } from "@/components/useLoopStep";

/* Small looping illustrations for the feature cards. They're decorative (the
   card text says the same thing), so each is hidden from assistive tech. With
   reduced motion each holds on its last, finished frame. */

const spring = { type: "spring", stiffness: 280, damping: 24 } as const;

function Stage({ children, stageRef }: { children: ReactNode; stageRef: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="relative h-44 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      {children}
    </div>
  );
}

export function LiveAssistVignette() {
  const { ref, step } = useLoopStep(5, 1500);
  return (
    <Stage stageRef={ref}>
      <div className="grid h-full gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-end gap-2 text-xs">
          <p className="text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-cyan)]">Dana</span> · 24:10
          </p>
          <p className="text-sm text-[var(--color-text)] leading-snug">
            <span className={`rounded transition-colors duration-500 ${step >= 1 ? "bg-[var(--color-accent)]/25" : ""}`}>
              What&apos;s our refund window for annual plans?
            </span>
          </p>
          <p className="text-[var(--color-text-secondary)] leading-snug">Can everyone see my screen?</p>
          <p className="text-[11px] text-[var(--color-text-secondary)]/80 italic">Small talk ignored</p>
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-end sm:static">
          <AnimatePresence mode="popLayout">
            {step === 2 && (
              <motion.p
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hidden sm:flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking your docs…
              </motion.p>
            )}
            {step >= 3 && (
              <motion.div
                key="card"
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="w-full rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-surface-elevated)] p-3"
              >
                <p className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] mb-1">
                  <Sparkles className="w-3 h-3" /> Say this
                </p>
                <p className="text-xs text-[var(--color-text)] leading-snug">
                  30 days from purchase, prorated after that.
                </p>
                <p className="mt-2 inline-flex items-center gap-1 rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                  <FileText className="w-3 h-3" /> Billing policy.docx · p. 2
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Stage>
  );
}

const PRIVACY_ROWS = ["Meeting audio", "Transcripts & notes", "Voice fingerprints", "AI: Ollama (local)"];

export function PrivacyVignette() {
  const { ref, step } = useLoopStep(PRIVACY_ROWS.length + 2, 1100);
  const on = step >= 1;
  return (
    <Stage stageRef={ref}>
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
          <Lock className="w-3.5 h-3.5 text-[var(--color-emerald)]" /> Local-only mode
        </span>
        <span
          className={`relative w-8 h-[18px] rounded-full transition-colors duration-300 ${
            on ? "bg-[var(--color-emerald)]" : "bg-[var(--color-border)]"
          }`}
        >
          <motion.span
            className="absolute top-[3px] left-[3px] w-3 h-3 rounded-full bg-white"
            animate={{ x: on ? 14 : 0 }}
            transition={spring}
          />
        </span>
      </div>
      <ul className="space-y-1.5">
        {PRIVACY_ROWS.map((row, i) => {
          const done = step >= i + 2;
          return (
            <li key={row} className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">{row}</span>
              <span
                className={`flex items-center gap-1 transition-colors duration-300 ${
                  done ? "text-[var(--color-emerald)]" : "text-[var(--color-text-secondary)]/40"
                }`}
              >
                <motion.span animate={{ scale: done ? [1.4, 1] : 1 }} transition={{ duration: 0.3 }}>
                  <Check className="w-3.5 h-3.5" />
                </motion.span>
                On your Mac
              </span>
            </li>
          );
        })}
      </ul>
    </Stage>
  );
}

const FILES = [
  { name: "Acme pilot notes.pdf", icon: FileText },
  { name: "Q4 roadmap.pptx", icon: Presentation },
  { name: "Pricing model.xlsx", icon: FileSpreadsheet },
  { name: "help.acme.com/sso", icon: Globe },
];

export function KnowledgeVignette() {
  const { ref, step } = useLoopStep(FILES.length + 2, 900);
  const indexed = Math.min(step, FILES.length);
  return (
    <Stage stageRef={ref}>
      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary)] mb-2">
        <span>Indexing on your Mac</span>
        <span className="tabular-nums">{Math.round((indexed / FILES.length) * 100)}%</span>
      </div>
      <div className="h-1 rounded-full bg-[var(--color-border)] mb-3 overflow-hidden">
        <motion.div
          className="h-full bg-[var(--color-accent)] origin-left"
          animate={{ scaleX: indexed / FILES.length }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <ul className="space-y-1.5">
        {FILES.map((file, i) => {
          const Icon = file.icon;
          const state = i < indexed ? "done" : i === indexed ? "working" : "queued";
          return (
            <li key={file.name} className="flex items-center gap-2 text-xs">
              <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-secondary)]" />
              <span className={`truncate ${state === "queued" ? "text-[var(--color-text-secondary)]/60" : "text-[var(--color-text)]"}`}>
                {file.name}
              </span>
              <span className="ml-auto shrink-0">
                {state === "done" && <Check className="w-3.5 h-3.5 text-[var(--color-emerald)]" />}
                {state === "working" && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)]" />}
              </span>
            </li>
          );
        })}
      </ul>
    </Stage>
  );
}

const VOICES = [
  { from: "Speaker 1", to: "Priya", color: "var(--color-cyan)" },
  { from: "Speaker 2", to: "Sam", color: "var(--color-amber)" },
  { from: "Speaker 3", to: "Jordan", color: "var(--color-sponsor)" },
];

export function SpeakersVignette() {
  const { ref, step } = useLoopStep(VOICES.length + 2, 1200);
  return (
    <Stage stageRef={ref}>
      <ul className="space-y-3">
        {VOICES.map((v, i) => {
          const named = step > i;
          return (
            <li key={v.from} className="flex items-center gap-3">
              <span
                className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold shrink-0"
                style={{ background: `color-mix(in srgb, ${v.color} 18%, transparent)`, color: v.color }}
              >
                {named ? v.to[0] : i + 1}
              </span>
              <span className="flex items-end gap-[2px] h-4 shrink-0">
                {[0, 1, 2, 3, 4, 5].map((b) => (
                  <span
                    key={b}
                    className="wave-bar w-[3px] h-full rounded-full"
                    style={{ background: v.color, opacity: 0.7, animationDelay: `${-(b + i * 2) * 0.15}s` }}
                  />
                ))}
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={named ? "to" : "from"}
                  initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  className="flex items-center gap-1 text-sm font-semibold"
                  style={{ color: named ? v.color : "var(--color-text-secondary)" }}
                >
                  {named ? v.to : v.from}
                  {named && <BadgeCheck className="w-3.5 h-3.5" />}
                </motion.span>
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <p className="absolute bottom-3 left-4 text-[11px] text-[var(--color-text-secondary)]">
        Voices remembered across Zoom, Meet, and in person
      </p>
    </Stage>
  );
}

const SLIDES = [
  { title: "Q3 revenue", kind: "chart" },
  { title: "Onboarding flow v2", kind: "design" },
  { title: "Launch plan", kind: "text" },
] as const;

export function SnapshotsVignette() {
  // Each slide is shown, snapped (the flash), then lands in the strip below.
  const { ref, step } = useLoopStep(SLIDES.length + 1, 1300);
  const current = SLIDES[Math.min(step, SLIDES.length - 1)];
  const captured = Math.min(step + 1, SLIDES.length);
  return (
    <Stage stageRef={ref}>
      <div className="relative h-[5.5rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.title}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-xs font-semibold text-[var(--color-text)] mb-2">{current.title}</p>
            <SlideBody kind={current.kind} />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {step < SLIDES.length && (
            <motion.div
              key={`flash-${step}`}
              className="absolute inset-0 bg-white pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.35, 0] }}
              transition={{ duration: 0.5, delay: 0.6, times: [0, 0.2, 1] }}
            />
          )}
        </AnimatePresence>
        <Camera className="absolute top-2 right-2 w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
      </div>
      <div className="mt-3 flex gap-2">
        {SLIDES.map((slide, i) => (
          <motion.div
            key={slide.title}
            initial={false}
            animate={{ opacity: i < captured ? 1 : 0.15, scale: i < captured ? 1 : 0.9 }}
            transition={{ ...spring, delay: i === step ? 0.6 : 0 }}
            className="flex-1 h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1"
          >
            <p className="truncate text-[9px] text-[var(--color-text-secondary)]">{slide.title}</p>
          </motion.div>
        ))}
      </div>
    </Stage>
  );
}

function SlideBody({ kind }: { kind: "chart" | "design" | "text" }) {
  if (kind === "chart") {
    return (
      <div className="flex items-end gap-1.5 h-9">
        {[40, 55, 48, 70, 88].map((h, i) => (
          <span key={i} className="w-3 rounded-sm bg-[var(--color-accent)]/70" style={{ height: `${h}%` }} />
        ))}
        <BarChart3 className="ml-auto w-4 h-4 text-[var(--color-text-secondary)]" />
      </div>
    );
  }
  if (kind === "design") {
    return (
      <div className="flex gap-1.5 h-9">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {[90, 70, 80].map((w, i) => (
        <span key={i} className="block h-1.5 rounded-full bg-[var(--color-border)]" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function EnrichVignette() {
  const { ref, step } = useLoopStep(2, 2800);
  const enriched = step === 1;
  return (
    <Stage stageRef={ref}>
      <div className="inline-flex rounded-lg bg-[var(--color-bg)] p-0.5 text-[11px] font-medium mb-3">
        {["Original", "Enriched"].map((label, i) => (
          <span key={label} className="relative px-2.5 py-1">
            {(i === 1) === enriched && (
              <motion.span
                layoutId="enrich-pill"
                className="absolute inset-0 rounded-md bg-[var(--color-surface-elevated)]"
                transition={spring}
              />
            )}
            <span className={`relative ${(i === 1) === enriched ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"}`}>
              {label}
            </span>
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {enriched ? (
          <motion.ul
            key="enriched"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-1.5 text-xs text-[var(--color-text)] leading-snug"
          >
            <li>• Acme needs SAML SSO (Okta) before rollout. <span className="text-[var(--color-text-secondary)]">12:52</span></li>
            <li>• Pricing: Jordan to confirm the annual discount by Wed.</li>
            <li>• Ship date holds at Friday if SSO lands Thursday.</li>
          </motion.ul>
        ) : (
          <motion.ul
            key="original"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-1.5 font-mono text-xs text-[var(--color-text-secondary)]"
          >
            <li>acme sso??</li>
            <li>pricing → ask jordan</li>
            <li>ship fri?</li>
          </motion.ul>
        )}
      </AnimatePresence>
    </Stage>
  );
}

const PROVIDERS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Groq",
  "OpenRouter",
  "AWS Bedrock",
  "Claude Code",
  "Codex CLI",
  "Ollama",
];

export function ProvidersVignette() {
  const { ref, step } = useLoopStep(PROVIDERS.length, 900);
  return (
    <Stage stageRef={ref}>
      <div className="flex flex-wrap gap-1.5">
        {PROVIDERS.map((p, i) => (
          <span key={p} className="relative rounded-full px-2.5 py-1 text-xs">
            {i === step && (
              <motion.span
                layoutId="provider-pill"
                className="absolute inset-0 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/15"
                transition={spring}
              />
            )}
            <span className={`relative ${i === step ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"}`}>
              {p}
            </span>
          </span>
        ))}
      </div>
      <p className="absolute bottom-3 left-4 right-4 text-[11px] text-[var(--color-text-secondary)]">
        Your key, your Claude or ChatGPT subscription, or fully local
      </p>
    </Stage>
  );
}
