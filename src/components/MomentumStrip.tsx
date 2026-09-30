import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, CalendarCheck, ListTodo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeMomentum, formatMinutes, greeting, type Momentum } from "@/lib/momentum";
import { useAllInsights } from "@/hooks/useInsights";
import type { Meeting } from "@/types";

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

function nudge(m: Momentum): string {
  if (m.today > 0) {
    return m.streak > 1
      ? `You're on a ${m.streak}-day streak. Keep it rolling.`
      : "First meeting of the day is in the bag.";
  }
  if (m.streak > 0) return `Record today to keep your ${m.streak}-day streak alive.`;
  return "Nothing recorded yet today. Press ⌘N when your next meeting starts.";
}

/**
 * The home-screen pulse: a greeting plus streak, weekly volume, and open
 * action items. Gives people a reason to come back and a nudge to record.
 */
export function MomentumStrip({ meetings }: { meetings: Meeting[] }) {
  const navigate = useNavigate();
  const m = useMemo(() => computeMomentum(meetings), [meetings]);
  const actions = useAllInsights("action_item", "open");
  const openActions = actions.loading || actions.error ? null : actions.insights.length;

  if (m.total === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{greeting()}</h2>
        <p className="text-sm text-muted-foreground">{nudge(m)}</p>
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
