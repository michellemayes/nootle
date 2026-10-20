import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Circle, FileText, History, ListTodo, Sparkles, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clockTime, relativeWhen } from "@/lib/momentum";
import type { MeetingBrief } from "@/types";


/** "Starts in 4 min", "Started 2 min ago", or the start time when it's further off. */
function startsIn(iso: string, now: number): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes < 0) return `Started ${-minutes} min ago`;
  if (minutes === 0) return "Starting now";
  if (minutes <= 60) return `Starts in ${minutes} min`;
  return `Today at ${clockTime(iso)}`;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The AI's few sentences on what to cover; nothing at all without a model. */
function WhatToCover({ brief }: { brief: MeetingBrief }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setText(undefined);
    invoke<string | null>("synthesize_meeting_brief", { brief })
      .then((t) => current && setText(t))
      .catch(() => current && setText(null));
    return () => {
      current = false;
    };
  }, [brief]);
  if (text === null) return null;
  return (
    <div className="rounded-lg bg-primary/5 px-3 py-2.5 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        What to cover
      </p>
      {text === undefined ? (
        <p className="animate-pulse text-muted-foreground">Thinking it over…</p>
      ) : (
        <p className="leading-relaxed">{text}</p>
      )}
    </div>
  );
}

interface MeetingBriefViewProps {
  brief: MeetingBrief;
  onRecord: () => void;
  onOpenMeeting: (meetingId: string) => void;
  recording?: boolean;
}

/**
 * The pre-meeting brief: who's coming, what's still open, what was decided
 * last time, and related documents. Shown in its own window before a
 * meeting and from the Meetings page's upcoming list.
 */
export function MeetingBriefView({ brief, onRecord, onOpenMeeting, recording }: MeetingBriefViewProps) {
  const { event, attendees, open_items, last_meeting, documents } = brief;
  const now = Date.now();
  const empty =
    attendees.length === 0 && open_items.length === 0 && !last_meeting && documents.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-w-0 pr-6">
        <p className="text-xs font-medium text-primary">{startsIn(event.start, now)}</p>
        <h2 className="truncate text-base font-semibold" title={event.title}>
          {event.title}
        </h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {clockTime(event.start)} – {clockTime(event.end)}
          {event.calendar && ` · ${event.calendar}`}
        </p>
      </div>

      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        <WhatToCover brief={brief} />

        {attendees.length > 0 && (
          <Section icon={<Users className="h-3.5 w-3.5" />} title="Who's coming">
            <ul className="space-y-1">
              {attendees.map((a) => (
                <li key={a.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.last_met
                      ? `Last met ${relativeWhen(a.last_met)} · ${a.meeting_count} ${a.meeting_count === 1 ? "meeting" : "meetings"}`
                      : "New to Nootle"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {open_items.length > 0 && (
          <Section icon={<ListTodo className="h-3.5 w-3.5" />} title={`Open action items (${open_items.length})`}>
            <ul className="space-y-1 pl-4">
              {open_items.map((item) => (
                <li key={item.id} className="list-disc text-sm">
                  {item.content}
                  {(item.assignee || item.due_date) && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {[item.assignee, item.due_date && `due ${item.due_date}`].filter(Boolean).join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {last_meeting && (
          <Section icon={<History className="h-3.5 w-3.5" />} title="Last time">
            <button
              type="button"
              onClick={() => onOpenMeeting(last_meeting.id)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              title={`Open "${last_meeting.title}"`}
            >
              {relativeWhen(last_meeting.start_time)} · Open notes
            </button>
            {last_meeting.decisions.length > 0 ? (
              <ul className="space-y-1 pl-4">
                {last_meeting.decisions.map((d) => (
                  <li key={d} className="list-disc text-sm">
                    {d}
                  </li>
                ))}
              </ul>
            ) : (
              last_meeting.summary && <p className="text-sm text-foreground/80">{last_meeting.summary}</p>
            )}
          </Section>
        )}

        {documents.length > 0 && (
          <Section icon={<FileText className="h-3.5 w-3.5" />} title="Related documents">
            <ul className="space-y-1.5">
              {documents.map((doc) => (
                <li key={doc.document_id}>
                  <button
                    type="button"
                    onClick={() => invoke("open_knowledge_document", { id: doc.document_id }).catch(() => {})}
                    className="block w-full rounded-md px-1.5 py-1 text-left hover:bg-accent"
                  >
                    <span className="block truncate text-sm font-medium">
                      {doc.title}
                      {doc.locator && <span className="font-normal text-muted-foreground"> · {doc.locator}</span>}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{doc.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {empty && (
          <p className="text-sm text-muted-foreground">
            Nothing on file for this meeting yet. Record it and next time's brief will have notes to go on.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {event.meeting_url && (
          <Button size="sm" variant="outline" onClick={() => openUrl(event.meeting_url!)} title={event.meeting_url}>
            <Video /> Join
          </Button>
        )}
        <Button size="sm" onClick={onRecord} disabled={recording}>
          <Circle /> Record
        </Button>
      </div>
    </div>
  );
}
