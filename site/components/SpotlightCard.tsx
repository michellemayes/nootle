"use client";

import type { PointerEvent, ReactNode } from "react";

/** A card with a soft accent light that follows the pointer. */
export function SpotlightCard({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--y", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      id={id}
      onPointerMove={onPointerMove}
      className={`group relative h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] transition-[border-color,translate] duration-300 hover:-translate-y-1 hover:border-[var(--color-accent)]/40 scroll-mt-24 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--x, 50%) var(--y, 0%), color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 65%)",
        }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  );
}
