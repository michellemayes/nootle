import { Mic, Settings, HelpCircle, Lightbulb, MessageSquare, FileText, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Top-level pages, in sidebar order. ⌘1…⌘7 jump to them by position. */
export const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Meetings", icon: Mic },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/people", label: "People", icon: Users },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/templates", label: "Automations", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
];
