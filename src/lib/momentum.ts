import type { Meeting } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Monday 00:00 of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY_MS);
}

export function meetingMinutes(m: Meeting): number {
  if (!m.end_time) return 0;
  return Math.max(0, (new Date(m.end_time).getTime() - new Date(m.start_time).getTime()) / 60000);
}

/**
 * Consecutive workdays with at least one recording, ending today (or the most
 * recent workday if today has nothing yet, so the streak doesn't look broken
 * first thing in the morning). Weekends never break a streak, but a weekend
 * recording still counts toward it.
 */
export function workdayStreak(meetings: Meeting[], now = new Date()): number {
  const days = new Set(meetings.map((m) => dayKey(new Date(m.start_time))));
  let cursor = startOfDay(now);
  let streak = 0;
  // Today hasn't happened yet — start counting from yesterday instead.
  if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  // Hard stop at a year so a weekend-only gap can't loop forever.
  for (let i = 0; i < 366; i++) {
    if (days.has(dayKey(cursor))) {
      streak++;
    } else if (!isWeekend(cursor)) {
      break;
    }
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

export interface Momentum {
  streak: number;
  /** Meetings started today. */
  today: number;
  thisWeek: number;
  minutesThisWeek: number;
  total: number;
}

export function computeMomentum(meetings: Meeting[], now = new Date()): Momentum {
  const today = startOfDay(now).getTime();
  const week = startOfWeek(now).getTime();
  let thisWeek = 0;
  let minutesThisWeek = 0;
  let todayCount = 0;
  for (const m of meetings) {
    const t = new Date(m.start_time).getTime();
    if (t >= today) todayCount++;
    if (t >= week) {
      thisWeek++;
      minutesThisWeek += meetingMinutes(m);
    }
  }
  return {
    streak: workdayStreak(meetings, now),
    today: todayCount,
    thisWeek,
    minutesThisWeek: Math.round(minutesThisWeek),
    total: meetings.length,
  };
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Buckets meetings (already sorted newest first) into human date sections. */
export function groupByDay(meetings: Meeting[], now = new Date()): { label: string; meetings: Meeting[] }[] {
  const today = startOfDay(now).getTime();
  const yesterday = today - DAY_MS;
  const week = startOfWeek(now).getTime();
  const groups: { label: string; meetings: Meeting[] }[] = [];
  for (const m of meetings) {
    const d = new Date(m.start_time);
    const t = d.getTime();
    const label =
      t >= today
        ? "Today"
        : t >= yesterday
          ? "Yesterday"
          : t >= week
            ? "Earlier this week"
            : t >= week - 7 * DAY_MS
              ? "Last week"
              : d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.meetings.push(m);
    else groups.push({ label, meetings: [m] });
  }
  return groups;
}

/** "2h ago" for today, the time for this week, otherwise the date. */
export function relativeWhen(dateStr: string, now = new Date()): string {
  const d = new Date(dateStr);
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (d.getTime() >= startOfDay(now).getTime()) return `${Math.floor(diffMin / 60)}h ago`;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.getTime() >= startOfWeek(now).getTime() - 7 * DAY_MS) {
    return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
