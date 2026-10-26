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

/**
 * Title block every top-level page starts with, so headers line up across
 * pages. In a narrow window the actions drop below the title and the tab row
 * wraps, so nothing in the header is ever cut off.
 */
export function PageHeader({ title, description, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn("shrink-0 border-b px-6 py-4", tabs && "pb-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-full">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex min-w-0 flex-wrap items-center gap-3 pt-1">{actions}</div>
        )}
      </div>
      {tabs && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">{tabs}</div>
      )}
    </div>
  );
}
