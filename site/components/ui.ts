const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap active:scale-[0.96] transition-[background-color,border-color,box-shadow,transform,scale,color] duration-200 disabled:opacity-60 disabled:pointer-events-none ${focusRing}`;

export const primaryButton = `${buttonBase} px-6 py-3 text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] hover:shadow-[0_0_24px_-6px_var(--color-accent)]`;

export const secondaryButton = `${buttonBase} px-6 py-3 text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-surface-elevated)]`;

export const quietButton = `${buttonBase} px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]`;

export const inputClass =
  "w-full min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)]/70 transition-colors focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/40";

export const cardClass = "rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]";

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
