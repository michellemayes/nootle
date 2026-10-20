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
    setLoading(true);
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

  /** Resolves to `null` if `cancelSummary` stopped it. */
  const generateSummary = useCallback(
    async (templateId: string, provider: string, model: string) => {
      const summary = await invoke<Summary | null>("generate_summary", {
        meetingId,
        templateId,
        provider,
        model,
      });
      if (summary) setSummaries((prev) => [summary, ...prev]);
      return summary;
    },
    [meetingId],
  );

  const cancelSummary = useCallback(
    () => invoke("cancel_summary", { meetingId }),
    [meetingId],
  );

  return { summaries, loading, error, refresh, generateSummary, cancelSummary };
}
