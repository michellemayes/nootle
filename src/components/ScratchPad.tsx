import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScratchPad } from "@/hooks/useScratchPad";
import { ChevronDown, ChevronRight, X, StickyNote } from "lucide-react";

interface ScratchPadProps {
  meetingId: string | null;
  elapsedMs: number;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ScratchPad({ meetingId, elapsedMs }: ScratchPadProps) {
  const { notes, addNote, deleteNote } = useScratchPad(meetingId);
  const [isOpen, setIsOpen] = useState(true);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    await addNote(trimmed, elapsedMs);
    setInput("");
  }, [input, elapsedMs, addNote]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  // Global keyboard shortcut: Cmd+Shift+N to focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="border-t">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <StickyNote className="h-3.5 w-3.5" />
        Quick Notes
        {notes.length > 0 && (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
            {notes.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a highlight note..."
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAdd}
                  disabled={!input.trim()}
                  className="h-8 px-3 text-xs"
                >
                  Add
                </Button>
              </div>

              {notes.length > 0 && (
                <div className="space-y-1 max-h-[160px] overflow-y-auto">
                  {notes.map((note) => (
                    <motion.div
                      key={note.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-start gap-2 rounded-md bg-amber-500/5 border border-amber-500/10 px-2.5 py-1.5 group"
                    >
                      <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
                        {formatTimestamp(note.timestamp_ms)}
                      </span>
                      <span className="text-xs text-foreground flex-1 leading-relaxed">
                        {note.content}
                      </span>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0"
                        title="Delete note"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
