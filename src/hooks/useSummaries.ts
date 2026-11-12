import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Summary, SummaryJob } from "@/types";

export function useSummaries(meetingId: string) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The backend's summary job for this meeting, including the one it starts
  // when a recording ends, so the page shows it however it was started.
  // `null` until it has loaded.
  const [job, setJob] = useState<Pick<SummaryJob, "running" | "error"> | null>(null);

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

  useEffect(() => {
    let live = true;
    setJob(null);
    invoke<SummaryJob | null>("get_summary_job", { meetingId })
      .catch(() => null)
      .then((j) => live && setJob(j ?? { running: false, error: null }));
    const unlisten = listen<SummaryJob>("summary-job", (event) => {
      if (event.payload.meeting_id === meetingId) setJob(event.payload);
    });
    return () => {
      live = false;
      unlisten.then((f) => f());
    };
  }, [meetingId]);

  /** Resolves to `null` if it was stopped or failed; a failure lands in `jobError`. */
  const generateSummary = useCallback(
    async (templateId: string, provider: string, model: string) => {
      setJob({ running: true, error: null });
      try {
        const summary = await invoke<Summary | null>("generate_summary", {
          meetingId,
          templateId,
          provider,
          model,
        });
        if (summary) setSummaries((prev) => [summary, ...prev]);
        return summary;
      } catch (err) {
        setJob({ running: false, error: String(err) });
        return null;
      }
    },
    [meetingId],
  );

  const cancelSummary = useCallback(
    () => invoke("cancel_summary", { meetingId }),
    [meetingId],
  );

  return {
    summaries,
    loading: loading || !job,
    error,
    refresh,
    generating: job?.running ?? false,
    jobError: job?.error ?? null,
    generateSummary,
    cancelSummary,
  };
}
