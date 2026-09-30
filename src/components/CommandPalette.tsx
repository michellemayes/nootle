import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Dialog as DialogPrimitive } from "radix-ui";
import { motion } from "framer-motion";
import { Circle, CornerDownLeft, FileText, Moon, Search, Sparkles, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "@/lib/navigation";
import { relativeWhen } from "@/lib/momentum";
import { useTheme } from "@/hooks/useTheme";
import { Kbd } from "@/components/Kbd";
import type { Meeting } from "@/types";

const OPEN_EVENT = "nootle:open-command-palette";

/** Opens the palette from anywhere (e.g. the sidebar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
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
  const [query, setQuery] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    // Empty query shows the most recent meetings; otherwise search titles.
    const t = setTimeout(() => {
      invoke<Meeting[]>("list_meetings", { search: query.trim() || null, includeArchived: false })
        .then(setMeetings)
        .catch(() => setMeetings([]));
    }, query ? 120 : 0);
    return () => clearTimeout(t);
  }, [open, query]);

  const go = useCallback(
    (fn: () => void) => () => {
      setOpen(false);
      fn();
    },
    [],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const actions: PaletteItem[] = [
      {
        id: "record",
        group: "Actions",
        label: "Start recording",
        icon: Circle,
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

    // Re-filter locally so a fast Enter never lands on a stale result.
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

  useEffect(() => setActive(0), [query]);

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
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-[18%] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl outline-none duration-150"
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search meetings, jump to a page, or run an action
          </DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
                        item.id === "record" ? "text-destructive" : "text-muted-foreground",
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
