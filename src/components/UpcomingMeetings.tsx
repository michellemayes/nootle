import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalendarDays, ChevronDown, ChevronRight, Circle, History, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecordingIntent } from "@/pages/RecordingView";
import { relativeWhen } from "@/lib/momentum";
import { useMeetings } from "@/hooks/useMeetings";
import { useAllInsights } from "@/hooks/useInsights";
import type { CalendarEvent, InsightWithActionItem, Meeting, UpcomingEvents } from "@/types";

const DISMISS_KEY = "calendarPromptDismissed";
const REFRESH_MS = 5 * 60 * 1000;
/** Coming back to the window refreshes, but not more than once a minute. */
const FOCUS_REFRESH_MS = 60 * 1000;
const SHOWN = 3;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const NO_EVENTS: CalendarEvent[] = [];

const normalizeTitle = (title: string) => title.trim().toLowerCase().replace(/\s+/g, " ");

/** What you need going into a meeting you've had before. */
interface Brief {
  last: Meeting;
  openItems: InsightWithActionItem[];
}

/**
 * Past meetings in the same series as each event (same title, or recorded
 * from that calendar event), newest first, with their open action items.
 */
function useBriefs(events: CalendarEvent[]): Map<string, Brief> {
  // Same cached, event-refreshed lists the library and momentum strip use.
  const { meetings } = useMeetings();
  const { insights: openItems } = useAllInsights("action_item", "open");

  const normalized = useMemo(
    () => meetings.filter((m) => m.status !== "recording").map((m) => ({ m, title: normalizeTitle(m.title) })),
    [meetings],
  );

  return useMemo(() => {
    const briefs = new Map<string, Brief>();
    for (const event of events) {
      const title = normalizeTitle(event.title);
      const series = normalized
        .filter(({ m, title: t }) => m.calendar_event_id === event.id || t === title)
        .map(({ m }) => m);
      if (series.length === 0) continue;
      const ids = new Set(series.map((m) => m.id));
      briefs.set(event.id, {
        last: series[0],
        openItems: openItems.filter((i) => ids.has(i.meeting_id)),
      });
    }
    return briefs;
  }, [events, normalized, openItems]);
}

function BriefLine({ brief }: { brief: Brief }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const count = brief.openItems.length;
  return (
    <span className="block text-xs text-muted-foreground">
      <span className="flex flex-wrap items-center gap-x-2">
        <button
          type="button"
          onClick={() => navigate(`/meeting/${brief.last.id}`)}
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-2"
          title={`Open "${brief.last.title}"`}
        >
          <History className="h-3 w-3" />
          Last met {relativeWhen(brief.last.start_time)}
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-0.5 hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {count} open action {count === 1 ? "item" : "items"}
          </button>
        )}
      </span>
      {expanded && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {brief.openItems.slice(0, 5).map((item) => (
            <li key={item.id} className="list-disc text-foreground/80">
              {item.content}
              {item.assignee && <span className="text-muted-foreground"> · {item.assignee}</span>}
            </li>
          ))}
          {count > 5 && <li className="list-none">and {count - 5} more</li>}
        </ul>
      )}
    </span>
  );
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The next few events from the Mac's calendar, each a click away from a
 * recording named after it (and the call link, when there is one).
 */
export function UpcomingMeetings() {
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState<UpcomingEvents | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now, setNow] = useState(() => Date.now());
  const events = useMemo(() => upcoming?.events.slice(0, SHOWN) ?? [], [upcoming]);
  const briefs = useBriefs(upcoming?.status === "granted" ? events : NO_EVENTS);

  const load = useCallback(() => {
    invoke<UpcomingEvents>("list_upcoming_events", { hours: 12 })
      .then(setUpcoming)
      .catch(() => setUpcoming(null));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      load();
    };
    const onFocus = () => {
      if (Date.now() - last > FOCUS_REFRESH_MS) refresh();
    };
    load();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (!upcoming || upcoming.status === "denied") return null;

  if (upcoming.status === "undetermined") {
    if (dismissed) return null;
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-muted-foreground">
          See your next meetings here and record them with their real names.
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => invoke("request_calendar_permission").finally(load)}
        >
          Connect calendar
        </Button>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // Not remembering the dismissal is fine.
            }
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (events.length === 0) return null;

  const record = (event: CalendarEvent) =>
    navigate("/recording", {
      state: { title: event.title, calendarEventId: event.id } satisfies RecordingIntent,
    });

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Up next
      </h2>
      <div className="divide-y rounded-xl border bg-card shadow-sm">
        {events.map((event) => {
          const live = new Date(event.start).getTime() <= now;
          const brief = briefs.get(event.id);
          return (
            <div key={event.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-36 shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {time(event.start)} – {time(event.end)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{event.title}</span>
                  {live && (
                    <Badge variant="destructive" size="sm">
                      Now
                    </Badge>
                  )}
                </span>
                {(event.calendar || event.attendee_count > 0) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      event.calendar,
                      event.attendee_count > 0 &&
                        `${event.attendee_count} ${event.attendee_count === 1 ? "guest" : "guests"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {brief && <BriefLine brief={brief} />}
              </span>
              {event.meeting_url && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => openUrl(event.meeting_url!)}
                  title={event.meeting_url}
                >
                  <Video /> Join
                </Button>
              )}
              <Button
                size="sm"
                variant={live ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => record(event)}
                title={`Record "${event.title}"`}
              >
                <Circle /> Record
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
