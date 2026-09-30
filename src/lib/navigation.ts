import { Mic, Settings, HelpCircle, Lightbulb, MessageSquare, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Top-level pages, in sidebar order. ⌘1…⌘6 jump to them by position. */
export const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Meetings", icon: Mic },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/templates", label: "Automations", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
];

/** True when a keypress is going into a text field and shouldn't trigger shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}
