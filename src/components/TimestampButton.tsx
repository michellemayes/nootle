import { cn, formatMs } from "@/lib/utils";

/** A transcript timestamp; plays the recording from there when clickable. */
export function TimestampButton({
  ms,
  onSeek,
  className,
}: {
  ms: number;
  onSeek?: (ms: number) => void;
  className?: string;
}) {
  const classes = cn("font-mono tabular-nums text-muted-foreground", className);
  if (!onSeek) return <span className={classes}>{formatMs(ms)}</span>;
  return (
    <button
      type="button"
      onClick={() => onSeek(ms)}
      title="Play from here"
      aria-label={`Play from ${formatMs(ms)}`}
      className={cn(classes, "rounded-sm transition-colors hover:text-primary hover:underline underline-offset-2")}
    >
      {formatMs(ms)}
    </button>
  );
}
