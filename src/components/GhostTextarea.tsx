import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { consumeGhost, SUGGEST_DEBOUNCE_MS, type FetchSuggestion } from "@/lib/noteSuggestion";
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
 * Tab accepts it, Escape dismisses it, and typing what it says keeps the rest. */
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
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = (next: Ghost | null) => {
    ghostRef.current = next;
    setGhostState(next);
  };
  const pendingCaret = useRef<number | null>(null);
  const request = useRef(0);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  // Ask once typing pauses, unless a suggestion is still showing.
  useEffect(() => {
    const id = ++request.current;
    if (!suggest || ghostRef.current) return;
    const timer = setTimeout(() => {
      const el = textareaRef.current;
      if (!el || document.activeElement !== el || !value.trim()) return;
      const at = lineEndCaret(el);
      if (at === null) return;
      suggest(value.slice(0, at), value.slice(at))
        .then((text) => {
          if (id !== request.current || !text) return;
          if (el.value !== value || lineEndCaret(el) !== at) return;
          setGhost({ text, at });
        })
        .catch(() => {});
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, suggest]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
    if (overlayRef.current && el) overlayRef.current.scrollTop = el.scrollTop;
  });

  const dismiss = () => {
    request.current++;
    setGhost(null);
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <textarea
        {...props}
        ref={setRefs}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setGhost(ghost && typedOver(ghost, value, next));
          onValueChange(next);
        }}
        onKeyDown={(e) => {
          if (ghost && e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            pendingCaret.current = ghost.at + ghost.text.length;
            setGhost(null);
            onValueChange(value.slice(0, ghost.at) + ghost.text + value.slice(ghost.at));
            return;
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
      {ghost && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          className={cn(
            className,
            "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent [scrollbar-gutter:stable]",
          )}
        >
          {value.slice(0, ghost.at)}
          <span className="note-ghost">
            {ghost.text}
            <Kbd className="note-ghost-key">Tab</Kbd>
          </span>
        </div>
      )}
    </div>
  );
}
