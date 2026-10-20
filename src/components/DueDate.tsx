import { Badge } from "@/components/ui/badge";

/** YYYY-MM-DD in local time, comparable as a string. */
function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A due date that calls out overdue and due-today items while they're open. */
export function DueDate({ date, done }: { date: string; done: boolean }) {
  const today = localIsoDate(new Date());
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  if (!done && date < today) {
    return <Badge variant="destructive" size="sm">Overdue · {label}</Badge>;
  }
  if (!done && date === today) {
    return <Badge variant="warning" size="sm">Due today</Badge>;
  }
  return <span>Due {label}</span>;
}
