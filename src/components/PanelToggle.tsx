import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** The full-width header that opens and closes a panel under the recording view's notes. */
export function PanelToggle({
  open,
  onOpenChange,
  icon,
  count,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: ReactNode;
  /** Shown as a badge when above zero. */
  count?: number;
  children: ReactNode;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
      className="flex w-full items-center gap-2 px-6 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Chevron className="h-3.5 w-3.5" />
      {icon}
      {children}
      {!!count && (
        <Badge variant="secondary" size="sm">
          {count}
        </Badge>
      )}
    </button>
  );
}
