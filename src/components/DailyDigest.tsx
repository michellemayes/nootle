import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { CalendarClock, ListTodo, Video } from "lucide-react";
import { ActionItemCheckbox } from "@/components/ActionItemCheckbox";
import { AiNote, BriefSection } from "@/components/BriefParts";
import { DueDate, localIsoDate } from "@/components/DueDate";
import { toast } from "@/components/Toaster";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, formatMinutes, startOfDay } from "@/lib/momentum";
import { cn, formatClockTime } from "@/lib/utils";
import type { BriefItem, DailyDigest as Digest, Meeting } from "@/types";

type Day = "today" | "yesterday";

const dateOf = (day: Day) => localIsoDate(addDays(new Date(), day === "today" ? 0 : -1));

function ItemList({
  items,
  done,
  onToggle,
  showMeeting,
}: {
  items: BriefItem[];
  done: Set<string>;
  onToggle: (item: BriefItem) => void;
  showMeeting?: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const isDone = done.has(item.id);
        return (
          <li key={item.id} className="flex items-start gap-2 text-sm">
            <ActionItemCheckbox done={isDone} onToggle={() => onToggle(item)} label={item.content} />
            <span className="min-w-0 flex-1">
              <span className={cn("block", isDone && "text-muted-foreground line-through")}>{item.content}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {item.assignee && <span>{item.assignee}</span>}
                {item.due_date && <DueDate date={item.due_date} done={isDone} />}
                {showMeeting && item.meeting_title && <span className="truncate">{item.meeting_title}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A day of meetings on one card: what you met about and decided, the action
 * items it produced, what's due, and a short AI recap.
 */
export function DailyDigest({ meetings }: { meetings: Meeting[] }) {
  const navigate = useNavigate();
  const [day, setDay] = useState<Day>(() => {
    const today = startOfDay(new Date()).getTime();
    const recorded = meetings.some((m) => m.status !== "recording" && new Date(m.start_time).getTime() >= today);
    return recorded ? "today" : "yesterday";
  });
  const [digest, setDigest] = useState<Digest | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const date = dateOf(day);

  useEffect(() => {
    let current = true;
    invoke<Digest>("get_daily_digest", { date })
      .then((d) => {
        if (!current) return;
        setDigest(d);
        setDone(new Set());
      })
      .catch(() => current && setDigest(null));
    return () => {
      current = false;
    };
  }, [date, meetings]);

  const toggle = (item: BriefItem) => {
    const wasDone = done.has(item.id);
    const flip = (prev: Set<string>) => {
      const next = new Set(prev);
      if (wasDone) next.delete(item.id);
      else next.add(item.id);
      return next;
    };
    setDone(flip);
    invoke("update_action_item_status", { id: item.id, status: wasDone ? "open" : "done" }).catch((err) => {
      setDone(flip);
      toast(`Couldn't update: ${err}`);
    });
  };

  if (!digest) return null;
  const itemSections = [
    { title: "New action items", icon: ListTodo, items: digest.new_items, showMeeting: false },
    { title: "Due", icon: CalendarClock, items: digest.due_items, showMeeting: true },
  ].filter((s) => s.items.length > 0);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily digest</h2>
        <Tabs value={day} onValueChange={(v) => setDay(v as Day)}>
          <TabsList className="h-8">
            <TabsTrigger value="today" className="text-xs">
              Today
            </TabsTrigger>
            <TabsTrigger value="yesterday" className="text-xs">
              Yesterday
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
        {digest.meetings.length > 0 && (
          <AiNote
            command="synthesize_daily_digest"
            args={{ date }}
            cacheKey={`${date}:${JSON.stringify(digest)}`}
            title="Recap"
            pending="Reading the day back…"
          />
        )}

        <div className="grid gap-5 @3xl/main:grid-cols-2">
          <BriefSection
            className="min-w-0 space-y-2"
            icon={<Video className="h-3.5 w-3.5" />}
            title={`Meetings (${digest.meetings.length})`}
          >
            {digest.meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {day === "today" ? "Nothing recorded yet today." : "Nothing recorded yesterday."}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {digest.meetings.map((m) => (
                  <li key={m.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/meeting/${m.id}`)}
                      className="flex w-full min-w-0 items-baseline gap-2 text-left underline-offset-2 hover:underline"
                    >
                      <span className="truncate text-sm font-medium">{m.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatClockTime(m.start_time)}
                        {m.minutes > 0 && ` · ${formatMinutes(m.minutes)}`}
                      </span>
                    </button>
                    {m.decisions.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {m.decisions.map((d) => (
                          <li key={d} className="list-disc text-sm text-foreground/80">
                            {d}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      m.summary && <p className="mt-0.5 line-clamp-2 text-sm text-foreground/80">{m.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </BriefSection>

          {itemSections.length > 0 && (
            <div className="min-w-0 space-y-5">
              {itemSections.map(({ title, icon: Icon, items, showMeeting }) => (
                <BriefSection
                  key={title}
                  className="space-y-2"
                  icon={<Icon className="h-3.5 w-3.5" />}
                  title={`${title} (${items.length})`}
                >
                  <ItemList items={items} done={done} onToggle={toggle} showMeeting={showMeeting} />
                </BriefSection>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
