import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalendarDays, Circle, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecordingIntent } from "@/pages/RecordingView";
import type { CalendarEvent, UpcomingEvents } from "@/types";

const DISMISS_KEY = "calendarPromptDismissed";
const REFRESH_MS = 5 * 60 * 1000;
/** Coming back to the window refreshes, but not more than once a minute. */
const FOCUS_REFRESH_MS = 60 * 1000;
const SHOWN = 3;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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

  const events = upcoming.events.slice(0, SHOWN);
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
