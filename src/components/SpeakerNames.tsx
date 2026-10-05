import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TranscriptSegment } from "@/types";

/**
 * Put names to diarized speakers ("Speaker 2" → "Priya"). The rename applies
 * to the whole meeting: chat, analytics, exports, and new summaries use it.
 * Giving two speakers the same name merges them.
 */
export function SpeakerNames({
  meetingId,
  segments,
  speakerClass,
  onRenamed,
}: {
  meetingId: string;
  segments: TranscriptSegment[];
  speakerClass: (speaker: string) => string;
  onRenamed: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const seg of segments) {
    counts.set(seg.speaker_label, (counts.get(seg.speaker_label) ?? 0) + 1);
  }

  const rename = async (from: string, to: string) => {
    const name = to.trim();
    if (!name || name === from) return;
    try {
      setError(null);
      await invoke<number>("rename_speaker", { meetingId, from, to: name });
      await onRenamed();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <Popover onOpenChange={() => setError(null)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={counts.size === 0}
          title="Name speakers"
          aria-label="Name speakers"
        >
          <Users className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-medium">Speakers</p>
          <p className="text-xs text-muted-foreground">
            Rename to put a name to a voice. Use the same name twice to merge.
          </p>
        </div>
        <div className="space-y-2">
          {[...counts].map(([speaker, lines]) => (
            // Keyed by label so a rename remounts the row with the new name.
            <div key={speaker} className="flex items-center gap-2">
              <Input
                defaultValue={speaker}
                aria-label={`Name for ${speaker}`}
                className={`h-8 text-sm font-medium ${speakerClass(speaker)}`}
                onBlur={(e) => rename(speaker, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") e.currentTarget.value = speaker;
                }}
              />
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {lines} {lines === 1 ? "line" : "lines"}
              </span>
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
