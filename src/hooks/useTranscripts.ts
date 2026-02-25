import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TranscriptSegment } from "@/types";

export function useTranscript(meetingId: string) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
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
    refresh();
  }, [refresh]);

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
