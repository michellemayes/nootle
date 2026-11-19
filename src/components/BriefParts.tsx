import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function BriefSection({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1.5", className)}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Replies already written, so going back to a brief or day doesn't ask the model again. */
const replies = new Map<string, string>();

/**
 * A few sentences from the AI, fetched with `command`. Renders nothing when
 * there's no model. `cacheKey` names the content the reply depends on; it
 * defaults to `args`.
 */
export function AiNote({
  command,
  args,
  cacheKey,
  title,
  pending,
}: {
  command: string;
  args: Record<string, unknown>;
  cacheKey?: string;
  title: string;
  pending: string;
}) {
  const key = `${command}:${cacheKey ?? JSON.stringify(args)}`;
  const argsRef = useRef(args);
  argsRef.current = args;
  const [text, setText] = useState<string | null | undefined>(() => replies.get(key));

  useEffect(() => {
    const cached = replies.get(key);
    setText(cached);
    if (cached !== undefined) return;
    let current = true;
    invoke<string | null>(command, argsRef.current)
      .then((t) => {
        if (t) replies.set(key, t);
        if (current) setText(t);
      })
      .catch(() => current && setText(null));
    return () => {
      current = false;
    };
  }, [command, key]);

  if (text === null) return null;
  return (
    <div className="rounded-lg bg-primary/5 px-3 py-2.5 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        {title}
      </p>
      {text === undefined ? (
        <p className="animate-pulse text-muted-foreground">{pending}</p>
      ) : (
        <p className="leading-relaxed">{text}</p>
      )}
    </div>
  );
}
