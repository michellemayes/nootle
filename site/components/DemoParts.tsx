"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, FileText } from "lucide-react";
import type { ReactNode } from "react";

/* Pieces shared by the hero demo and the feature vignettes. */

/** A speaker label that blurs into their name once they're recognised. */
export function NameSwap({
  named,
  label,
  name,
  color,
  labelColor,
}: {
  named: boolean;
  label: string;
  name: string;
  color: string;
  /** Colour before the name is known; inherits when omitted. */
  labelColor?: string;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={named ? "name" : "label"}
        initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
        transition={{ duration: 0.3 }}
        className="inline-flex items-center gap-1 font-semibold"
        style={{ color: named ? color : labelColor }}
      >
        {named ? name : label}
        {named && <BadgeCheck className="w-3.5 h-3.5" />}
      </motion.span>
    </AnimatePresence>
  );
}

/** Bouncing level bars, like an audio meter. */
export function WaveBars({
  count,
  color,
  seed = 0,
  className = "h-3.5",
}: {
  count: number;
  color: string;
  seed?: number;
  className?: string;
}) {
  return (
    <span className={`flex items-end gap-[2px] shrink-0 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="wave-bar w-[3px] h-full rounded-full"
          style={{
            background: color,
            animationDelay: `${-((i + seed) * 0.17)}s`,
            animationDuration: `${0.8 + ((i * 7 + seed) % 5) * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}

/** A cited document, as shown under an answer. */
export function SourceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
      <FileText className="w-3 h-3" />
      {children}
    </span>
  );
}
