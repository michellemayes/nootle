import type { ReactNode } from "react";

import { Markdown } from "@/components/Markdown";
import { ThinkingDots } from "@/components/ThinkingDots";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: string;
  content: string;
  /** Rendered under the message body, e.g. source citations. */
  footer?: ReactNode;
}

/** A single chat bubble, shared by the chat page, meeting chat, and floating chat. */
export function ChatMessage({ role, content, footer }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-muted text-foreground",
        )}
      >
        {isUser ? content : <Markdown content={content} />}
        {footer}
      </div>
    </div>
  );
}

/** Placeholder bubble shown while the assistant is replying. */
export function ChatThinking() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg bg-muted px-3 py-2">
        <ThinkingDots />
      </div>
    </div>
  );
}
