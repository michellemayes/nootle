import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Flame, CalendarCheck, ListTodo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeMomentum, formatMinutes, greeting } from "@/lib/momentum";
import type { InsightWithActionItem, Meeting } from "@/types";

function Stat({
  icon: Icon,
  value,
  label,
  accent,
  onClick,
  delay,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: React.ReactNode;
  accent?: string;
  onClick?: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={onClick ? { y: -2 } : undefined}
      transition={{ duration: 0.25, delay }}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors",
        onClick ? "cursor-pointer hover:bg-accent/30" : "cursor-default",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted", accent)}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold leading-tight tabular-nums">{value}</span>
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </motion.button>
  );
}

/**
 * The home-screen pulse: a greeting plus streak, weekly volume, and open
 * action items. Gives people a reason to come back and a nudge to record.
 */
export function MomentumStrip({ meetings }: { meetings: Meeting[] }) {
  const navigate = useNavigate();
  const [openActions, setOpenActions] = useState<number | null>(null);
  const m = useMemo(() => computeMomentum(meetings), [meetings]);

  useEffect(() => {
    const load = () =>
      invoke<InsightWithActionItem[]>("get_all_insights", {
        insightType: "action_item",
        status: "open",
        search: null,
      })
        .then((items) => setOpenActions(items.length))
        .catch(() => setOpenActions(null));
    load();
    const unlisten = listen("insights-updated", load);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (m.total === 0) return null;

  const nudge = m.today > 0
    ? m.streak > 1
      ? `You're on a ${m.streak}-day streak. Keep it rolling.`
      : "First meeting of the day is in the bag."
    : m.streak > 0
      ? `Record today to keep your ${m.streak}-day streak alive.`
      : "Nothing recorded yet today. Press ⌘N when your next meeting starts.";

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{greeting()}</h2>
        <p className="text-sm text-muted-foreground">{nudge}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Stat
          icon={Flame}
          delay={0}
          accent={m.streak > 0 ? "bg-warning/15 text-warning-foreground" : "text-muted-foreground"}
          value={
            <motion.span
              key={m.streak}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              className="inline-block"
            >
              {m.streak}
            </motion.span>
          }
          label="day streak"
        />
        <Stat
          icon={CalendarCheck}
          delay={0.05}
          accent="bg-primary/10 text-primary"
          value={m.thisWeek}
          label={
            <>
              {m.thisWeek === 1 ? "meeting" : "meetings"} this week
              {m.minutesThisWeek > 0 && <> · {formatMinutes(m.minutesThisWeek)}</>}
            </>
          }
        />
        {openActions !== null && (
          <Stat
            icon={ListTodo}
            delay={0.1}
            accent={openActions > 0 ? "bg-success/15 text-success-foreground" : "text-muted-foreground"}
            value={openActions}
            label={openActions === 0 ? "action items · all clear" : `open action ${openActions === 1 ? "item" : "items"}`}
            onClick={() => navigate("/insights")}
          />
        )}
      </div>
    </div>
  );
}
