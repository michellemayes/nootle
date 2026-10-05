import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TranscriptSegment } from "@/types";

/** Append segments not already in `base`, keeping `base` if nothing is new. */
export function mergeSegments(
  base: TranscriptSegment[],
  incoming: TranscriptSegment[],
): TranscriptSegment[] {
  const seen = new Set(base.map((seg) => seg.id));
  const fresh = incoming.filter((seg) => !seen.has(seg.id));
  return fresh.length ? [...base, ...fresh] : base;
}

export function useTranscript(meetingId: string) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<TranscriptSegment[]>("get_transcript", {
        meetingId,
      });
      setSegments(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Segments still being transcribed stream in live: a recording that just
  // stopped, or an imported file.
  useEffect(() => {
    const unlisten = listen<TranscriptSegment[]>("transcript-update", (event) => {
      const incoming = event.payload.filter((seg) => seg.meeting_id === meetingId);
      if (incoming.length === 0) return;
      setSegments((prev) => mergeSegments(prev, incoming));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [meetingId]);

  return { segments, loading, error, refresh };
}

export interface TranscriptSearchResult {
  meeting_id: string;
  meeting_title: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export async function searchTranscripts(
  query: string,
): Promise<TranscriptSearchResult[]> {
  return invoke<TranscriptSearchResult[]>("search_transcripts", { query });
}
