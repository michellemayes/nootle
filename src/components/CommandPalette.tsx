import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { Circle, CornerDownLeft, FileText, Keyboard, Moon, Search, Sparkles, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toggleShortcutsHelp } from "@/components/ShortcutsHelp";
import { cn } from "@/lib/utils";
import { navItems } from "@/lib/navigation";
import { relativeWhen } from "@/lib/momentum";
import { useTheme } from "@/hooks/useTheme";
import { Kbd } from "@/components/Kbd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Meeting } from "@/types";

const TOGGLE_EVENT = "nootle:toggle-command-palette";

/** Opens (or closes) the palette from anywhere: ⌘K, the sidebar button. */
export function toggleCommandPalette() {
  window.dispatchEvent(new Event(TOGGLE_EVENT));
}

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  iconClassName?: string;
  shortcut?: string;
  run: () => void;
}

function matches(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  // Every word has to appear somewhere, in any order.
  return q.split(/\s+/).every((w) => t.includes(w));
}

/**
 * ⌘K: one box to start a recording, jump to any page or meeting, or ask
 * the AI a question about everything you've recorded.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const [query, setQuery] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const setOpenAndReset = useCallback((next: boolean) => {
    setOpen(next);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpenAndReset(!openRef.current);
    window.addEventListener(TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_EVENT, onToggle);
  }, [setOpenAndReset]);

  // Load the library once per open and filter locally as the user types.
  useEffect(() => {
    if (!open) return;
    invoke<Meeting[]>("list_meetings", { search: null, includeArchived: false })
      .then(setMeetings)
      .catch(() => setMeetings([]));
  }, [open]);

  const go = useCallback(
    (fn: () => void) => () => {
      setOpenAndReset(false);
      fn();
    },
    [setOpenAndReset],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const actions: PaletteItem[] = [
      {
        id: "record",
        group: "Actions",
        label: "Start recording",
        icon: Circle,
        iconClassName: "text-destructive",
        shortcut: "⌘N",
        run: go(() => navigate("/recording")),
      },
      {
        id: "theme",
        group: "Actions",
        label: theme === "light" ? "Switch to dark mode" : "Switch to light mode",
        icon: theme === "light" ? Moon : Sun,
        run: go(toggleTheme),
      },
      {
        id: "shortcuts",
        group: "Actions",
        label: "Keyboard shortcuts",
        icon: Keyboard,
        shortcut: "?",
        run: go(toggleShortcutsHelp),
      },
    ].filter((a) => matches(q, a.label));

    const pages: PaletteItem[] = navItems
      .map((n, i) => ({
        id: `page:${n.to}`,
        group: "Go to",
        label: n.label,
        icon: n.icon,
        shortcut: `⌘${i + 1}`,
        run: go(() => navigate(n.to)),
      }))
      .filter((p) => matches(q, p.label));

    const meetingItems: PaletteItem[] = meetings
      .filter((m) => matches(q, m.title))
      .slice(0, q ? 8 : 5)
      .map((m) => ({
      id: `meeting:${m.id}`,
      group: q ? "Meetings" : "Recent meetings",
      label: m.title,
      hint: relativeWhen(m.start_time),
      icon: FileText,
      run: go(() => navigate(`/meeting/${m.id}`)),
    }));

    const ask: PaletteItem[] = q
      ? [
          {
            id: "ask",
            group: "Ask",
            label: `Ask Nootle: “${q}”`,
            hint: "across all meetings",
            icon: Sparkles,
            run: go(() => navigate("/chat", { state: { prompt: q } })),
          },
        ]
      : [];

    // With a query, meetings are what people are usually hunting for.
    return q
      ? [...meetingItems, ...actions, ...pages, ...ask]
      : [...actions, ...meetingItems, ...pages];
  }, [query, meetings, theme, toggleTheme, navigate, go]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={setOpenAndReset}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] block max-w-xl translate-y-0 gap-0 overflow-hidden rounded-xl bg-popover p-0 text-popover-foreground shadow-2xl duration-150 sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search meetings, jump to a page, or run an action
          </DialogDescription>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Search meetings, jump anywhere, or ask a question…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Command palette search"
            />
            <Kbd>esc</Kbd>
          </div>
          <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto p-2" role="listbox">
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches that.</p>
            )}
            {items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const isActive = i === active;
              return (
                <div key={item.id}>
                  {header && (
                    <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {header}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={item.run}
                    className={cn(
                      "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      isActive ? "text-accent-foreground" : "text-foreground",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="palette-active"
                        className="absolute inset-0 rounded-lg bg-accent"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <item.icon
                      className={cn(
                        "relative h-4 w-4 shrink-0",
                        item.iconClassName ?? "text-muted-foreground",
                      )}
                    />
                    <span className="relative flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="relative shrink-0 text-xs text-muted-foreground">{item.hint}</span>
                    )}
                    {item.shortcut && <Kbd className="relative">{item.shortcut}</Kbd>}
                    {isActive && !item.shortcut && (
                      <CornerDownLeft className="relative h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            <span className="ml-auto inline-flex items-center gap-1">
              <Kbd>⌘K</Kbd> toggle
            </span>
          </div>
      </DialogContent>
    </Dialog>
  );
}
