import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { markdownToHtml } from "@/lib/markdown";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  /** `icon` is a bare icon affordance; `button` shows a labelled button. */
  variant?: "icon" | "button";
  /** Label for the `button` variant. */
  label?: string;
  /**
   * Treat `text` as Markdown and also put formatted HTML on the clipboard,
   * so pasting into Mail, Docs, or Notion keeps headings, bold, and lists.
   * Plain-text targets still get the Markdown.
   */
  markdown?: boolean;
  className?: string;
}

async function writeClipboard(text: string, markdown: boolean) {
  if (markdown && typeof ClipboardItem !== "undefined") {
    try {
      const html = markdownToHtml(text);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Fall back to plain text below.
    }
  }
  await navigator.clipboard.writeText(text);
}

/** Copies `text` and confirms with a checkmark. Used for transcripts, summaries, and config snippets. */
export function CopyButton({
  text,
  variant = "icon",
  label = "Copy",
  markdown = false,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await writeClipboard(text, markdown);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [text, markdown]);

  if (variant === "button") {
    return (
      <Button
        variant="secondary"
        size="xs"
        onClick={handleCopy}
        className={className}
      >
        {copied ? <Check className="text-success-foreground" /> : <Copy />}
        {copied ? "Copied" : label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : "Copy to clipboard"}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className={cn(
        "inline-flex items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success-foreground" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
