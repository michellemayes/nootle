import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  /** e.g. Undo. Runs once, then the toast closes. */
  action?: { label: string; onClick: () => void };
}

const DEFAULT_DURATION_MS = 5000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/**
 * Show a short notice at the bottom of the window. Prefer an Undo action
 * over a confirm dialog for anything reversible: it keeps people moving and
 * still lets them back out.
 */
export function toast(message: string, options: Pick<Toast, "action"> & { duration?: number } = {}) {
  const id = nextId++;
  // Newest last; keep the stack short so it never covers the page.
  toasts = [...toasts.slice(-2), { id, message, action: options.action }];
  emit();
  setTimeout(() => dismissToast(id), options.duration ?? DEFAULT_DURATION_MS);
  return id;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => toasts;

export function Toaster() {
  const items = useSyncExternalStore(subscribe, snapshot);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border bg-popover py-2 pl-4 pr-2 text-sm text-popover-foreground shadow-lg"
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  t.action!.onClick();
                }}
                className="shrink-0 rounded px-2 py-1 text-sm font-medium text-primary hover:bg-accent"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
