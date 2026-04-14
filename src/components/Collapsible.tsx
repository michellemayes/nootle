import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

export function Collapsible({ open, children, className }: CollapsibleProps) {
  return (
    <div
      className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out", className)}
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
