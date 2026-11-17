import { cn } from "@/lib/utils";

const KBD_BASE =
  "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border px-1 font-sans text-[10px] font-medium";
const KBD_PLAIN = "bg-muted text-muted-foreground";
/** Kbd's look, for key hints built outside React. */
export const KBD_CLASS = `${KBD_BASE} ${KBD_PLAIN}`;

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
        KBD_BASE,
        onSolid ? "border-white/30 bg-white/15 text-white" : KBD_PLAIN,
        className,
      )}
    >
      {children}
    </kbd>
  );
}
