import { MessageSquare, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

/** Starter questions, so an empty chat never starts from a blank box. */
export const MEETING_PROMPTS = [
  "Summarize this meeting in three bullets",
  "What did we decide?",
  "List the action items and who owns them",
  "What questions were left open?",
];

export const LIBRARY_PROMPTS = [
  "What are my open action items?",
  "What did we decide this week?",
  "Which topics keep coming up?",
  "Help me prepare for my next meeting",
];

export function SuggestedPrompts({
  prompts,
  intro,
  onPick,
  disabled,
}: {
  prompts: string[];
  intro: string;
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <EmptyState
      size="panel"
      icon={MessageSquare}
      description={intro}
      action={
        <div className="flex w-full flex-col gap-1.5">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt)}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              {prompt}
            </button>
          ))}
        </div>
      }
    />
  );
}
