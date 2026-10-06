import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/Kbd";
import { navItems } from "@/lib/navigation";
import { isTypingTarget } from "@/lib/utils";

const TOGGLE_EVENT = "nootle:toggle-shortcuts-help";

/** Opens (or closes) the shortcuts sheet from anywhere: "?", the ⌘K palette. */
export function toggleShortcutsHelp() {
  window.dispatchEvent(new Event(TOGGLE_EVENT));
}

const SECTIONS: { title: string; shortcuts: { keys: string[]; label: string }[] }[] = [
  {
    title: "Anywhere",
    shortcuts: [
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["⌘", "N"], label: "Start recording" },
      { keys: ["⌘", `1–${navItems.length}`], label: "Jump to a page" },
      { keys: ["⌘", ","], label: "Settings" },
      { keys: ["?"], label: "Show this list" },
    ],
  },
  {
    title: "Meetings",
    shortcuts: [{ keys: ["/"], label: "Search titles and transcripts" }],
  },
  {
    title: "Recording",
    shortcuts: [
      { keys: ["⌘", "⇧", "N"], label: "Add a quick note" },
      { keys: ["⌘", "↵"], label: "Stop recording" },
    ],
  },
  {
    title: "Meeting",
    shortcuts: [
      { keys: ["Space"], label: "Play or pause" },
      { keys: ["←", "→"], label: "Skip back or forward 15 seconds" },
      { keys: ["⌘", "F"], label: "Find in transcript" },
      { keys: ["↵", "⇧↵"], label: "Next or previous match" },
      { keys: ["Double-click"], label: "Fix a word in the transcript" },
    ],
  },
];

/** "?" shows every keyboard shortcut in one place. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener(TOGGLE_EVENT, onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(TOGGLE_EVENT, onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">Every keyboard shortcut in Nootle</DialogDescription>
        <div className="grid gap-5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.shortcuts.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">{s.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
