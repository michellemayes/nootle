import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SpeakerAnalytics {
  id: string;
  meeting_id: string;
  speaker_label: string;
  talk_time_ms: number;
  turn_count: number;
  interruption_count: number;
  avg_turn_length_ms: number;
  longest_monologue_ms: number;
}

interface SentimentSegment {
  id: string;
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  sentiment: "positive" | "neutral" | "negative";
  score: number;
}

interface MeetingEngagement {
  id: string;
  meeting_id: string;
  engagement_level: "high" | "medium" | "low";
  participation_balance: number;
  question_count: number;
  back_and_forth_ratio: number;
}

interface AnalyticsData {
  speakers: SpeakerAnalytics[];
  sentiment: SentimentSegment[];
  engagement: MeetingEngagement | null;
}

export function useAnalytics(meetingId: string) {
  const [data, setData] = useState<AnalyticsData>({
    speakers: [],
    sentiment: [],
    engagement: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        setError(null);
        const result = await invoke<AnalyticsData>("get_meeting_analytics", {
          meetingId,
        });
        setData(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [meetingId],
  );

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    const unlisten = listen<string>("analytics-ready", (event) => {
      if (event.payload === meetingId) {
        fetchAnalytics(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [meetingId, fetchAnalytics]);

  const computeAnalytics = useCallback(async () => {
    await invoke("compute_meeting_analytics", { meetingId });
    await fetchAnalytics(true);
  }, [meetingId, fetchAnalytics]);

  const computeSentiment = useCallback(
    async (provider: string, model: string) => {
      await invoke("compute_meeting_sentiment", {
        meetingId,
        provider,
        model,
      });
      await fetchAnalytics(true);
    },
    [meetingId, fetchAnalytics],
  );

  return {
    speakers: data.speakers,
    sentiment: data.sentiment,
    engagement: data.engagement,
    loading,
    error,
    refresh: fetchAnalytics,
    computeAnalytics,
    computeSentiment,
  };
}
