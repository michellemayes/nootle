import { formatMs } from "@/lib/utils";
import type { ChatSource } from "@/types";

export function SourceCitation({
  source,
  onClick,
}: {
  source: ChatSource;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors"
    >
      {source.meeting_title}, {formatMs(source.start_ms)}
    </button>
  );
}
