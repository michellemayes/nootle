"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { BREW_COMMAND } from "@/components/site-config";

export function CopyCommand({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(BREW_COMMAND);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context); the command stays selectable.
    }
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-4 pr-1.5 py-1.5 text-left ${className}`}
    >
      <span aria-hidden="true" className="font-mono text-xs text-[var(--color-accent)] select-none">
        $
      </span>
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs text-[var(--color-text)] select-all [scrollbar-width:none]">
        {BREW_COMMAND}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy Homebrew install command"}
        className="relative shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "check" : "copy"}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {copied ? (
              <Check className="w-4 h-4 text-[var(--color-emerald)]" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}
