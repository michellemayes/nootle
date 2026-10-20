import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppWindow, Circle, Mic, Pause, Play, Sparkles, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import { NootleLogo } from "@/components/NootleLogo";
import { cn, formatClockTime, formatDuration, plural } from "@/lib/utils";
import type { CalendarEvent, MenuBarStatus, UpcomingEvents } from "@/types";

/** How often the timer and Live Assist card refresh while the popover is open. */
const POLL_MS = 1000;

/** "Now", "in 12 min" or "at 3:30 PM". */
function startsWhen(event: CalendarEvent, now: number): string {
  const minutes = Math.round((new Date(event.start).getTime() - now) / 60_000);
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `In ${minutes} min`;
  return `At ${formatClockTime(event.start)}`;
}

/** The recording's state, polled while the popover has focus (it hides on blur). */
function useMenuBarStatus() {
  const [status, setStatus] = useState<MenuBarStatus | null>(null);
  const refresh = useCallback(() => {
    invoke<MenuBarStatus>("menu_bar_status")
      .then(setStatus)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.hasFocus()) refresh();
    }, POLL_MS);
    const unlisten = [listen("recording-changed", refresh), listen("menu-bar-shown", refresh)];
    return () => {
      clearInterval(timer);
      unlisten.forEach((u) => u.then((fn) => fn()));
    };
  }, [refresh]);
  return [status, refresh] as const;
}

/** Fits the window to the card, so no invisible margin catches clicks, and
 * lets Escape close it like a menu. */
function useFitWindow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const win = getCurrentWindow();
    const observer = new ResizeObserver(() => {
      win.setSize(new LogicalSize(el.offsetWidth, el.offsetHeight)).catch(() => {});
    });
    observer.observe(el);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") win.hide().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return ref;
}

/** The next calendar event, refreshed each time the popover opens. */
function useNextEvent() {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  useEffect(() => {
    const load = () =>
      invoke<UpcomingEvents>("list_upcoming_events", { hours: 12 })
        .then((upcoming) => setEvent(upcoming.events[0] ?? null))
        .catch(() => setEvent(null));
    load();
    const unlisten = listen("menu-bar-shown", load);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
  return event;
}

/** Appends a timestamped quick note to the meeting being recorded. */
function QuickNote({ meetingId, elapsedMs }: { meetingId: string; elapsedMs: number }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    await invoke("add_scratch_note", { meetingId, content, timestampMs: elapsedMs });
    setText("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={saved ? "Note added" : "Add a quick note…"}
        aria-label="Quick note"
        className="h-8 text-xs"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>
        Add
      </Button>
    </form>
  );
}

/**
 * The popover under Nootle's menu bar icon: the recording and its controls,
 * a quick note, the newest Live Assist card, and the next meeting.
 */
export function MenuBarPopover() {
  const [status, refresh] = useMenuBarStatus();
  const next = useNextEvent();
  const ref = useFitWindow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const start = (event?: CalendarEvent) =>
    run(() =>
      invoke("start_recording", {
        title: event?.title ?? "",
        calendarEventId: event?.id ?? null,
        templateId: null,
      }),
    );

  const recording = status?.recording;
  const card = status?.live_assist;

  return (
    <div ref={ref} className="w-[340px] p-2 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none">
      <div className="flex flex-col gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-md">
        <section aria-label="Recording" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                recording ? "bg-destructive/10" : "bg-primary/10",
              )}
            >
              {recording ? (
                <span
                  className={cn(
                    "size-3 rounded-full bg-destructive",
                    !recording.paused && "animate-pulse motion-reduce:animate-none",
                    recording.paused && "opacity-40",
                  )}
                />
              ) : (
                <NootleLogo className="size-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {!recording ? "Not recording" : recording.paused ? "Paused" : "Recording"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {recording ? status?.title : "Start when your meeting does"}
              </p>
            </div>
            {recording && (
              <span className="text-lg font-semibold tabular-nums" aria-label="Recorded time">
                {formatDuration(Math.floor(recording.elapsed_ms / 1000))}
              </span>
            )}
          </div>

          {recording ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => invoke("set_recording_paused", { paused: !recording.paused }))
                }
              >
                {recording.paused ? <Play /> : <Pause />}
                {recording.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => run(() => invoke("stop_recording"))}
              >
                <Square />
                Stop
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => start()}>
              <Mic />
              Start recording
            </Button>
          )}

          {recording && <QuickNote meetingId={recording.meeting_id} elapsedMs={recording.elapsed_ms} />}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </section>

        {card && (
          <section aria-label="Live Assist" className="rounded-xl border bg-card p-3 text-xs">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-primary">
              <Sparkles className="size-3" /> Live Assist
            </p>
            <p className="mb-1 text-muted-foreground">
              {card.automatic ? "Heard: " : "You asked: "}
              <span className="text-foreground">{card.question}</span>
            </p>
            <div className="[&_p]:mb-0! [&_p]:line-clamp-4 [&_p]:text-xs! [&_p]:leading-snug! [&_p]:text-foreground!">
              {card.answer ? (
                <Markdown content={card.answer} />
              ) : (
                `${plural(card.sources.length, "related passage")} found`
              )}
            </div>
          </section>
        )}

        {next && (
          <section aria-label="Up next" className="flex items-center gap-3 border-t pt-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {startsWhen(next, Date.now())} · {formatClockTime(next.start)} –{" "}
                {formatClockTime(next.end)}
              </p>
              <p className="truncate text-sm font-medium">{next.title}</p>
            </div>
            {next.meeting_url && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => openUrl(next.meeting_url!)}
                title={next.meeting_url}
              >
                <Video /> Join
              </Button>
            )}
            {!recording && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => start(next)}
                title={`Record "${next.title}"`}
              >
                <Circle /> Record
              </Button>
            )}
          </section>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground"
          onClick={() => invoke("menu_bar_open_main")}
        >
          <AppWindow />
          Open Nootle
        </Button>
      </div>
    </div>
  );
}
