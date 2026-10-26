import { Link } from "react-router-dom";
import { Check, CircleCheck, Hourglass, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DueDate } from "@/components/DueDate";
import { cn, momentLink, plural } from "@/lib/utils";
import type { Commitment, CommitmentStatus } from "@/types";

/** "2 meetings ago", counting the meetings recorded since it was made. */
export function commitmentAge(c: Commitment): string {
  return c.meetings_since === 0 ? "in the last meeting" : `${plural(c.meetings_since, "meeting")} ago`;
}

/** Still owed: open, or slipped. */
export const isPending = (c: Commitment) => c.status === "open" || c.status === "slipped";

/** What a later meeting showed: done, or slipped. */
export function VerdictIcon({ verdict, className }: { verdict: "done" | "slipped"; className?: string }) {
  return verdict === "done" ? (
    <CircleCheck className={cn("shrink-0 text-success-foreground", className)} />
  ) : (
    <Hourglass className={cn("shrink-0 text-warning-foreground", className)} />
  );
}

const shortDate = (time: string) =>
  new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const STATUS_BADGE: Record<CommitmentStatus, { label: string; variant: "outline" | "warning" | "success" | "secondary" }> = {
  open: { label: "Open", variant: "outline" },
  slipped: { label: "Slipped", variant: "warning" },
  done: { label: "Done", variant: "success" },
  dropped: { label: "Dropped", variant: "secondary" },
};

/** A commitment: who owes what since when, the moment it was made, the
 * later moment that showed it done or slipped, and buttons to close or
 * reopen it by hand. */
export function CommitmentRow({
  commitment: c,
  onSetStatus,
  showOwner = true,
}: {
  commitment: Commitment;
  onSetStatus: (id: string, status: CommitmentStatus) => void;
  showOwner?: boolean;
}) {
  const closed = !isPending(c);
  const badge = STATUS_BADGE[c.status];
  return (
    <div className="group/commitment flex flex-wrap items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/30">
      <div className="min-w-0 flex-1 basis-48">
        <p className={cn("text-sm leading-relaxed", closed && "text-muted-foreground line-through")}>
          {c.content}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
          {showOwner && <span className="font-medium text-foreground/80">{c.owner}</span>}
          <Link
            to={momentLink(c.meeting_id, c.transcript_start_ms)}
            className="hover:text-foreground hover:underline"
            title={`Open the moment in ${c.meeting_title}`}
          >
            Committed {commitmentAge(c)} ({shortDate(c.meeting_start_time)})
          </Link>
          {c.due_date && <DueDate date={c.due_date} done={closed} />}
        </div>
        {c.evidence && (
          <Link
            to={momentLink(c.evidence.meeting_id, c.evidence.timestamp_ms)}
            className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <VerdictIcon verdict={c.evidence.verdict} className="mt-px h-3.5 w-3.5" />
            <span className="min-w-0">
              {c.evidence.verdict === "done" ? "Done" : "Slipped"} in{" "}
              <span className="underline-offset-2 hover:underline">{c.evidence.meeting_title}</span>
              {c.evidence.quote && <span className="italic"> · “{c.evidence.quote}”</span>}
            </span>
          </Link>
        )}
      </div>
      <div className="ml-auto flex shrink-0 gap-1 opacity-60 transition-opacity group-hover/commitment:opacity-100 focus-within:opacity-100">
        {closed ? (
          <Button variant="ghost" size="xs" onClick={() => onSetStatus(c.id, "open")} title="Reopen">
            <RotateCcw /> Reopen
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="xs" onClick={() => onSetStatus(c.id, "done")} title="Mark done">
              <Check /> Done
            </Button>
            <Button variant="ghost" size="xs" onClick={() => onSetStatus(c.id, "dropped")} title="Drop: it's no longer happening">
              <X /> Drop
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
