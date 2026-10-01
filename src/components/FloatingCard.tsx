import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/** Bottom-right popover card used for app-level prompts. */
export function FloatingCard({
  show,
  onDismiss,
  children,
}: {
  show: boolean;
  /** Omit to hide the dismiss button. */
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-4 right-4 z-50 w-80"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <div
            role="status"
            className="flex gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-xl"
          >
            {children}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="-mr-1 self-start rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function FloatingCardRow({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
