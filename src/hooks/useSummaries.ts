import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Summary } from "@/types";

export function useSummaries(meetingId: string) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Summary[]>("get_summaries", { meetingId });
      setSummaries(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const generateSummary = useCallback(
    async (promptId: string, provider: string, model: string) => {
      const summary = await invoke<Summary>("generate_summary", {
        meetingId,
        promptId,
        provider,
        model,
      });
      await refresh();
      return summary;
    },
    [meetingId, refresh],
  );

  return { summaries, loading, error, refresh, generateSummary };
}
