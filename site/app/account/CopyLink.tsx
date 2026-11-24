"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { primaryButton } from "@/components/ui";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        aria-label="Your invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-3 text-sm tabular-nums text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      />
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true), () => {})}
        className={`${primaryButton} sm:w-32`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="inline-flex items-center gap-2"
          >
            {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </motion.span>
        </AnimatePresence>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Invite link copied" : ""}
      </span>
    </div>
  );
}
