import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import {
  consumeGhost,
  ghostText,
  lineShape,
  nextMarker,
  SuggestionRunner,
  type FetchSuggestion,
} from "@/lib/noteSuggestion";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/Kbd";

interface Ghost {
  text: string;
  at: number;
}

/** The caret's index when the selection is empty and sits at the end of a line. */
function lineEndCaret(el: HTMLTextAreaElement): number | null {
  const { selectionStart: at, selectionEnd, value } = el;
  if (at !== selectionEnd) return null;
  return at === value.length || value[at] === "\n" ? at : null;
}

/** The suggestion left after an edit from `prev` to `next`: its rest when
 * the edit typed its start at the caret, otherwise null. */
function typedOver(ghost: Ghost, prev: string, next: string): Ghost | null {
  const grew = next.length - prev.length;
  if (grew <= 0 || next.slice(0, ghost.at) !== prev.slice(0, ghost.at)) return null;
  if (next.slice(ghost.at + grew) !== prev.slice(ghost.at)) return null;
  const rest = consumeGhost(ghost.text, next.slice(ghost.at, ghost.at + grew));
  return rest ? { text: rest, at: ghost.at + grew } : null;
}

/** A textarea that shows an AI suggestion as ghost text after the caret:
 * Tab accepts it, Escape dismisses it, and typing what it says keeps the rest.
 * Enter on a list line starts the next item, or ends the list on an empty one. */
export function GhostTextarea({
  value,
  onValueChange,
  suggest,
  className,
  ref,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggest: FetchSuggestion | null;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const [pending, setPending] = useState<{ at: number; value: string } | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = (next: Ghost | null) => {
    ghostRef.current = next;
    setGhostState(next);
  };
  const suggestRef = useRef(suggest);
  suggestRef.current = suggest;
  const pendingCaret = useRef<number | null>(null);

  const [runner] = useState(
    () =>
      new SuggestionRunner({
        fetch: () => suggestRef.current,
        read: () => {
          const el = textareaRef.current;
          const at = el && document.activeElement === el ? lineEndCaret(el) : null;
          return el && at !== null ? { before: el.value.slice(0, at), after: el.value.slice(at) } : null;
        },
        show: (suggestion, before, typed) => {
          const el = textareaRef.current;
          if (!el || ghostRef.current) return false;
          const full = ghostText(before, suggestion);
          const text = typed ? consumeGhost(full, typed) : full;
          if (!text) return false;
          setGhost({ text, at: before.length + typed.length });
          return true;
        },
        pending: (on) => {
          const el = textareaRef.current;
          const at = on && el ? lineEndCaret(el) : null;
          setPending(el && at !== null ? { at, value: el.value } : null);
        },
      }),
  );
  useEffect(() => () => runner.cancel(), [runner]);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
    if (overlayRef.current && el) overlayRef.current.scrollTop = el.scrollTop;
  });

  const dismiss = () => {
    runner.cancel();
    setGhost(null);
  };

  const overlayAt = ghost?.at ?? (pending?.value === value ? pending.at : null);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <textarea
        {...props}
        ref={setRefs}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          const kept = ghost && typedOver(ghost, value, next);
          setGhost(kept);
          onValueChange(next);
          if (!kept) runner.schedule();
        }}
        onKeyDown={(e) => {
          if (ghost && e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            pendingCaret.current = ghost.at + ghost.text.length;
            setGhost(null);
            onValueChange(value.slice(0, ghost.at) + ghost.text + value.slice(ghost.at));
            runner.schedule();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.nativeEvent.isComposing) {
            const at = lineEndCaret(e.currentTarget);
            if (at !== null) {
              const start = value.lastIndexOf("\n", at - 1) + 1;
              const line = lineShape(value.slice(start, at));
              if (line.marker) {
                e.preventDefault();
                setGhost(null);
                const next = line.content.trim()
                  ? value.slice(0, at) + "\n" + line.indent + nextMarker(line.marker) + value.slice(at)
                  : value.slice(0, start) + value.slice(at);
                pendingCaret.current = next.length - (value.length - at);
                onValueChange(next);
                runner.schedule();
                return;
              }
            }
          }
          if (ghost && e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            dismiss();
            return;
          }
          props.onKeyDown?.(e);
        }}
        onSelect={(e) => {
          if (ghost && lineEndCaret(e.currentTarget) !== ghost.at) dismiss();
          props.onSelect?.(e);
        }}
        onBlur={(e) => {
          dismiss();
          props.onBlur?.(e);
        }}
        onScroll={(e) => {
          if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
          props.onScroll?.(e);
        }}
        className={cn("[scrollbar-gutter:stable]", className)}
      />
      {overlayAt !== null && overlayAt <= value.length && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          className={cn(
            className,
            "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent [scrollbar-gutter:stable]",
          )}
        >
          {value.slice(0, overlayAt)}
          {ghost ? (
            <span className="note-ghost">
              {ghost.text}
              <Kbd className="note-ghost-key">Tab</Kbd>
            </span>
          ) : (
            <span className="note-ghost-pending" />
          )}
        </div>
      )}
    </div>
  );
}
