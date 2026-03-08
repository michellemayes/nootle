import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

  // Listen for auto-run summary completions
  useEffect(() => {
    const unlisten = listen<string>("summaries-updated", (event) => {
      if (event.payload === meetingId) {
        refresh();
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, [meetingId, refresh]);

  const generateSummary = useCallback(
    async (templateId: string, provider: string, model: string) => {
      const summary = await invoke<Summary>("generate_summary", {
        meetingId,
        templateId,
        provider,
        model,
      });
      setSummaries((prev) => [summary, ...prev]);
      return summary;
    },
    [meetingId],
  );

  return { summaries, loading, error, refresh, generateSummary };
}
