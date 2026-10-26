import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MeetingAnnotation, TranscriptSegment } from "@/types";

/** How often to look for annotations an agent added while the meeting is open. */
const REFRESH_MS = 10_000;

/**
 * A meeting's annotations: your highlights and agents' notes. Agents add
 * theirs from another process (`nootle-cli mcp`), which can't send the app
 * events, so unless `poll` is off this re-reads them every few seconds while
 * the window is visible and whenever it regains focus.
 */
export function useAnnotations(meetingId: string | null, { poll = true }: { poll?: boolean } = {}) {
  const [annotations, setAnnotations] = useState<MeetingAnnotation[]>([]);

  const refresh = useCallback(async () => {
    if (!meetingId) return;
    try {
      const fresh = await invoke<MeetingAnnotation[]>("list_meeting_annotations", { meetingId });
      // Most polls find nothing new; keep the same array so the page doesn't re-render.
      setAnnotations((prev) => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh));
    } catch {
      // Keep what's shown; the next refresh tries again.
    }
  }, [meetingId]);

  useEffect(() => {
    setAnnotations([]);
    refresh();
    if (!poll) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, poll]);

  const setResolved = useCallback(async (id: string, resolved: boolean) => {
    await invoke("resolve_meeting_annotation", { id, resolved });
    const resolvedAt = resolved ? new Date().toISOString() : null;
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, resolved_at: resolvedAt } : a)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke("delete_meeting_annotation", { id });
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /** Highlights a transcript line as you, quoting it. */
  const highlight = useCallback(
    async (seg: TranscriptSegment) => {
      if (!meetingId) return;
      const added = await invoke<MeetingAnnotation>("highlight_transcript", {
        meetingId,
        startMs: seg.start_ms,
        endMs: seg.end_ms,
        text: seg.text,
      });
      setAnnotations((prev) => [...prev, added].sort((a, b) => a.start_ms - b.start_ms));
    },
    [meetingId],
  );

  // Your highlights and agents' notes, apart.
  const { highlights, agentNotes } = useMemo(
    () => ({
      highlights: annotations.filter((a) => a.by_user),
      agentNotes: annotations.filter((a) => !a.by_user),
    }),
    [annotations],
  );

  return { annotations, highlights, agentNotes, setResolved, remove, highlight };
}
