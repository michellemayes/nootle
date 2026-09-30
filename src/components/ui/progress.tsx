import { cn } from "@/lib/utils"

/** Thin progress track; pass `percent={null}` for an indeterminate pulse. */
function Progress({ percent, className }: { percent: number | null; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full bg-primary",
          percent === null ? "w-1/3 animate-pulse" : "transition-[width] duration-300",
        )}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  )
}

export { Progress }
