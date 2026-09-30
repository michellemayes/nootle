import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  /** Replaces the default Enter-to-send handling, e.g. for a slash menu. */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

/** Message input with a send button; Enter sends unless `onKeyDown` takes over. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  onKeyDown,
  inputRef,
  className,
}: ChatComposerProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
        onKeyDown={
          onKeyDown ??
          ((e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          })
        }
      />
      <Button
        size="icon"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
      >
        <Send />
      </Button>
    </div>
  );
}
