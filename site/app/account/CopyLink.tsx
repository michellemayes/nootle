"use client";

import { CopyIcon, useCopy } from "@/components/CopyCommand";
import { primaryButton } from "@/components/ui";

export function CopyLink({ url }: { url: string }) {
  const [copied, copy] = useCopy(url);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        aria-label="Your invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-3 text-sm tabular-nums text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      />
      <button type="button" onClick={copy} className={`${primaryButton} sm:w-32`}>
        <CopyIcon copied={copied} className="inline-flex items-center gap-2">
          {copied ? "Copied" : "Copy link"}
        </CopyIcon>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Invite link copied" : ""}
      </span>
    </div>
  );
}
