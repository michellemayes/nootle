import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Controls, filters, or actions pinned to the right of the header. */
  actions?: ReactNode;
  /** A tab strip (and any controls beside it) shown under the title, sharing the header's divider. */
  tabs?: ReactNode;
  className?: string;
}

/** Title block every top-level page starts with, so headers line up across pages. */
export function PageHeader({ title, description, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn("shrink-0 border-b px-6 py-4", tabs && "pb-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-3 pt-1">{actions}</div>
        )}
      </div>
      {tabs && (
        <div className="mt-3 flex items-center justify-between gap-4">{tabs}</div>
      )}
    </div>
  );
}
