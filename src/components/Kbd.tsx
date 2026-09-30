import { cn } from "@/lib/utils";

/** A keyboard shortcut hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({
  children,
  className,
  onSolid,
}: {
  children: React.ReactNode;
  className?: string;
  /** Sitting on a filled (primary/destructive) button. */
  onSolid?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border px-1 font-sans text-[10px] font-medium",
        onSolid ? "border-white/30 bg-white/15 text-white" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
