import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

type Doodle = { style: CSSProperties; depth: number; className?: string; art: ReactNode; mascot?: boolean };

const sparkle = (color: string) => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill={color}>
    <path d="M12 0c.7 6.2 5.1 10.9 12 12-6.9 1.1-11.3 5.8-12 12-.7-6.2-5.1-10.9-12-12C6.9 10.9 11.3 6.2 12 0Z" />
  </svg>
);

const waves = (color: string) => (
  <svg viewBox="0 0 32 32" className="w-full h-full" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
    <path d="M10 10a9 9 0 0 1 0 12" />
    <path d="M16 5a16 16 0 0 1 0 22" />
    <path d="M22 1a22 22 0 0 1 0 30" opacity="0.5" />
  </svg>
);

const ring = (color: string) => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="3">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const squiggle = (color: string) => (
  <svg viewBox="0 0 48 16" className="w-full h-full" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
    <path d="M2 8c5-8 9 8 14 0s9 8 14 0 9 8 14 0" />
  </svg>
);

/** `depth` scales how far each doodle drifts with the cursor and the scroll. */
const DOODLES: Doodle[] = [
  { style: { top: "22%", left: "8%" }, depth: 0.8, className: "w-7 h-7", art: sparkle("var(--color-amber)") },
  { style: { top: "58%", left: "4%" }, depth: 0.4, className: "w-12 h-4 hidden md:block", art: squiggle("var(--color-cyan)") },
  { style: { top: "80%", left: "14%" }, depth: 1, className: "w-5 h-5", art: ring("var(--color-sponsor)") },
  { style: { top: "18%", right: "9%" }, depth: 0.6, className: "w-11 h-11 hidden sm:block", mascot: true, art: (
    <Image src="/nootle-icon.svg" alt="" width={44} height={44} className="rounded-xl shadow-lg shadow-black/30" />
  ) },
  { style: { top: "50%", right: "5%" }, depth: 1.1, className: "w-8 h-8 hidden md:block", art: waves("var(--color-accent)") },
  { style: { top: "76%", right: "15%" }, depth: 0.7, className: "w-5 h-5", art: sparkle("var(--color-emerald)") },
];

/**
 * Little floating shapes around a hero. PageMotion pops them in, bobs them and nudges them away from the cursor.
 * Pass `mascot={false}` where the hero already shows the app icon.
 */
export function Doodles({ mascot = true }: { mascot?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[600px] -z-10">
      {DOODLES.filter((d) => mascot || !d.mascot).map((d, i) => (
        <span key={i} data-doodle data-depth={d.depth} className={`absolute ${d.className ?? ""}`} style={d.style}>
          <span data-doodle-bob className="block w-full h-full">
            {d.art}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The site's hand-drawn underline. PageMotion draws it on; the path uses pathLength 1 so CSS can hide it until then. */
export function Squiggle({ children }: { children: ReactNode }) {
  return (
    <span data-squiggle className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        className="absolute left-0 -bottom-[0.12em] w-full h-[0.22em] overflow-visible"
      >
        <path
          d="M4 16 C 60 6, 120 4, 170 10 S 260 20, 296 8"
          pathLength={1}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
