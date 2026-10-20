import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Turns on Meeting Coach. Off unless turned on. */
export const COACH_SETTING = "meeting_coach";

export interface CoachMetrics {
  talk_share: number;
  talk_time_ms: number;
  words: number;
  words_per_minute: number;
  interruptions: number;
  times_interrupted: number;
  questions: number;
  statements: number;
  filler_count: number;
  fillers_per_minute: number;
  top_fillers: [string, number][];
  longest_monologue_ms: number;
  long_monologues: number;
}

export interface MeetingCoach {
  metrics: CoachMetrics;
  tip: string | null;
}

export interface CoachTrendPoint extends CoachMetrics {
  meeting_id: string;
  title: string;
  start_time: string;
}

/** A meeting's Coach card: `coach` is null when none of the meeting was you. */
export function useMeetingCoach(meetingId: string, enabled: boolean) {
  const [coach, setCoach] = useState<MeetingCoach | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!enabled) return;
    invoke<MeetingCoach | null>("get_meeting_coach", { meetingId })
      .then(setCoach)
      .catch(() => setCoach(null))
      .finally(() => setLoading(false));
  }, [meetingId, enabled]);

  useEffect(refresh, [refresh]);

  // Speaker renames rebuild analytics; "You" may have moved.
  useEffect(() => {
    if (!enabled) return;
    const unlisten = listen<string>("analytics-ready", (event) => {
      if (event.payload === meetingId) refresh();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [meetingId, enabled, refresh]);

  const suggestTip = useCallback(
    async (provider: string, model: string) => {
      const tip = await invoke<string>("suggest_coach_tip", { meetingId, provider, model });
      setCoach((c) => c && { ...c, tip });
    },
    [meetingId],
  );

  return { coach, loading, suggestTip };
}

/** Your coach metrics across your last `limit` meetings, oldest first. */
export function useCoachTrends(enabled: boolean, limit = 10) {
  const [points, setPoints] = useState<CoachTrendPoint[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    invoke<CoachTrendPoint[]>("get_coach_trends", { limit })
      .then(setPoints)
      .catch(() => setPoints([]));
  }, [enabled, limit]);
  return points;
}
