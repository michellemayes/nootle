import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A row of controls (filters, actions, pickers) that wraps onto another line
 * when the window is too narrow for it, instead of running off the edge. Use
 * it for any row of more than two controls; give a control that should take
 * the spare room `flex-1` plus a `min-w-*` it can't usefully go below.
 */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)} {...props} />;
}
