import { memo, useState } from "react";
import { Bot, Check, ChevronDown, Flag, Highlighter, MessageSquare, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/Collapsible";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Markdown } from "@/components/Markdown";
import { segmentIndexAt } from "@/components/AudioPlayerControls";
import { TimestampButton } from "@/components/TimestampButton";
import { cn, formatMs } from "@/lib/utils";
import type { AnnotationKind, MeetingAnnotation, TranscriptSegment } from "@/types";

export const ANNOTATION_KINDS: Record<
  AnnotationKind,
  { label: string; icon: LucideIcon; dot: string; text: string; line: string }
> = {
  comment: { label: "Comment", icon: MessageSquare, dot: "bg-chart-1", text: "text-chart-1", line: "border-l-chart-1" },
  highlight: { label: "Highlight", icon: Highlighter, dot: "bg-highlight", text: "text-highlight-foreground", line: "border-l-highlight" },
  flag: { label: "Flag", icon: Flag, dot: "bg-destructive", text: "text-destructive", line: "border-l-destructive" },
};

/** The annotations on each transcript line: the line each starts in, and any its range covers. */
export function annotationsBySegment(
  segments: TranscriptSegment[],
  annotations: MeetingAnnotation[],
): Map<string, MeetingAnnotation[]> {
  const bySegment = new Map<string, MeetingAnnotation[]>();
  for (const a of annotations) {
    const first = Math.max(0, segmentIndexAt(segments, a.start_ms));
    const end = a.end_ms ?? a.start_ms;
    for (let i = first; i < segments.length && (i === first || segments[i].start_ms <= end); i++) {
      const id = segments[i].id;
      bySegment.set(id, [...(bySegment.get(id) ?? []), a]);
    }
  }
  return bySegment;
}

/** Ticks on the seek bar at each annotation, colored by kind. */
export const AnnotationMarkers = memo(function AnnotationMarkers({
  annotations,
  duration,
  onSeek,
}: {
  annotations: MeetingAnnotation[];
  /** Seconds. */
  duration: number;
  onSeek: (ms: number) => void;
}) {
  if (!duration) return null;
  const at = (ms: number) => `${Math.min(100, (ms / 1000 / duration) * 100)}%`;
  return (
    <>
      {annotations.map((a) => {
          const kind = ANNOTATION_KINDS[a.kind];
          return (
            <span key={a.id}>
              {a.end_ms !== null && (
                <span
                  className={cn("pointer-events-none absolute top-0 h-1.5 rounded-full opacity-40", kind.dot)}
                  style={{ left: at(a.start_ms), width: `calc(${at(a.end_ms)} - ${at(a.start_ms)})` }}
                />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(a.start_ms);
                }}
                title={`${kind.label} by ${a.author} at ${formatMs(a.start_ms)}: ${a.body}`}
                aria-label={`${kind.label} by ${a.author} at ${formatMs(a.start_ms)}`}
                className={cn(
                  "absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background transition-transform hover:scale-125",
                  kind.dot,
                )}
                style={{ left: at(a.start_ms) }}
              />
            </span>
          );
        })}
    </>
  );
});

/**
 * Comments, highlights, and flags agents pinned to the meeting, above the
 * player. Kept apart from the user's own notes and labeled as an agent's.
 */
export function AgentNotesPanel({
  annotations,
  onSeek,
  onResolve,
  onRemove,
}: {
  annotations: MeetingAnnotation[];
  onSeek: (ms: number) => void;
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [removing, setRemoving] = useState<MeetingAnnotation | null>(null);
  if (annotations.length === 0) return null;
  const openCount = annotations.filter((a) => !a.resolved_at).length;

  return (
    <div className="shrink-0 border-t">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-2 text-left hover:bg-muted/40"
      >
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">Agent notes</span>
        <Badge variant="secondary" size="sm">
          {openCount > 0 ? `${openCount} open` : "All resolved"}
        </Badge>
        <span className="text-xs text-muted-foreground">Added by agents over MCP or the CLI, not by you</span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      <Collapsible open={open}>
        <ul className="max-h-40 space-y-1.5 overflow-y-auto px-5 pb-3">
          {annotations.map((a) => {
            const kind = ANNOTATION_KINDS[a.kind];
            const Icon = kind.icon;
            const resolved = !!a.resolved_at;
            return (
              <li
                key={a.id}
                className={cn(
                  "group flex items-start gap-3 rounded-md border border-l-4 bg-muted/20 px-3 py-1.5",
                  kind.line,
                  resolved && "opacity-60",
                )}
              >
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", kind.text)} aria-label={kind.label} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      <TimestampButton ms={a.start_ms} onSeek={onSeek} />
                      {a.end_ms !== null && `–${formatMs(a.end_ms)}`}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">
                      <Bot className="h-3 w-3" />
                      {a.author}
                    </span>
                    {resolved && <span>Resolved</span>}
                  </div>
                  <div className={cn("text-sm [&_:last-child]:mb-0", resolved && "line-through decoration-muted-foreground/50")}>
                    <Markdown content={a.body} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onResolve(a.id, !resolved)}
                    aria-label={resolved ? "Reopen" : "Resolve"}
                    title={resolved ? "Reopen" : "Resolve"}
                  >
                    {resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setRemoving(a)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Collapsible>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete agent note?"
        description="It's removed from this meeting for good. The agent that added it can't see it any more either."
        onConfirm={async () => {
          if (removing) await onRemove(removing.id);
        }}
      />
    </div>
  );
}
