import { cn } from "@/lib/utils";

/** Loading copy, kept in one place so every surface reads the same way. */
export const LOADING_COPY = {
  meetings: "Loading meetings…",
  meeting: "Loading meeting…",
  insights: "Loading insights…",
  transcript: "Loading transcript…",
  analytics: "Loading analytics…",
  templates: "Loading templates…",
  slashCommands: "Loading slash commands…",
  workflows: "Loading workflows…",
  integrations: "Loading integrations…",
  permissions: "Checking permissions…",
} as const;

interface LoadingStateProps {
  message: string;
  /** `fill` centers in the remaining space; `inline` sits in normal flow. */
  layout?: "fill" | "inline";
  className?: string;
}

export function LoadingState({
  message,
  layout = "fill",
  className,
}: LoadingStateProps) {
  if (layout === "inline") {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>{message}</p>
    );
  }

  return (
    <div
      className={cn("flex flex-1 items-center justify-center p-8", className)}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
