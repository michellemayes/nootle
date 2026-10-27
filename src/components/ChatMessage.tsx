import type { KeyboardEvent, ReactNode, Ref } from "react";
import { CircleAlert, CircleCheck, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import { ThinkingDots } from "@/components/ThinkingDots";
import { cn } from "@/lib/utils";
import type { ChatActionOutcome } from "@/types";

interface ChatMessageProps {
  role: string;
  content: string;
  /** Changes the assistant made while replying, listed under its answer. */
  actions?: ChatActionOutcome[];
  /** Rendered under the message body, e.g. source citations. */
  footer?: ReactNode;
}

/** A single chat bubble, shared by the chat page, meeting chat, and floating chat. */
export function ChatMessage({ role, content, actions, footer }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm wrap-break-word",
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-muted text-foreground",
        )}
      >
        {isUser ? content : content && <Markdown content={content} />}
        {actions && actions.length > 0 && <ChatActions actions={actions} hasContent={!!content} />}
        {footer}
      </div>
    </div>
  );
}

/** What the assistant changed, one line per change, failures included. */
function ChatActions({ actions, hasContent }: { actions: ChatActionOutcome[]; hasContent: boolean }) {
  return (
    <ul
      aria-label="Changes made"
      className={cn("space-y-1 text-xs", hasContent && "mt-2 border-t border-border/60 pt-2")}
    >
      {actions.map((action, i) => {
        const Icon = action.ok ? CircleCheck : CircleAlert;
        return (
          <li
            key={i}
            className={cn("flex items-start gap-1.5", action.ok ? "text-muted-foreground" : "text-destructive")}
          >
            <Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", action.ok && "text-success")} aria-hidden />
            <span>
              <span className="sr-only">{action.ok ? "Done: " : "Failed: "}</span>
              {action.summary}
            </span>
          </li>
        );
      })}
    </ul>
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
