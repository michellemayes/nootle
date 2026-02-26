import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InsightWithActionItem } from "@/types";

export function useInsights(meetingId: string) {
  const [insights, setInsights] = useState<InsightWithActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<InsightWithActionItem[]>("get_insights", {
        meetingId,
      });
      setInsights(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decisions = insights.filter((i) => i.type === "decision");
  const actionItems = insights.filter((i) => i.type === "action_item");
  const keyMoments = insights.filter((i) => i.type === "key_moment");

  const extractInsights = useCallback(
    async (provider: string, model: string) => {
      await invoke("extract_meeting_insights", {
        meetingId,
        provider,
        model,
      });
      await refresh();
    },
    [meetingId, refresh],
  );

  const reExtractInsights = useCallback(
    async (provider: string, model: string) => {
      await invoke("re_extract_meeting_insights", {
        meetingId,
        provider,
        model,
      });
      await refresh();
    },
    [meetingId, refresh],
  );

  const toggleActionItem = useCallback(
    async (actionItemId: string, currentStatus: string) => {
      const newStatus = currentStatus === "done" ? "open" : "done";
      await invoke("update_action_item_status", {
        id: actionItemId,
        status: newStatus,
      });
      await refresh();
    },
    [refresh],
  );

  const updateActionItem = useCallback(
    async (
      actionItemId: string,
      assignee: string | null,
      dueDate: string | null,
    ) => {
      await invoke("update_action_item", {
        id: actionItemId,
        assignee,
        dueDate,
      });
      await refresh();
    },
    [refresh],
  );

  return {
    insights,
    decisions,
    actionItems,
    keyMoments,
    loading,
    error,
    refresh,
    extractInsights,
    reExtractInsights,
    toggleActionItem,
    updateActionItem,
  };
}

export function useAllInsights(
  insightType?: string,
  status?: string,
  search?: string,
) {
  const [insights, setInsights] = useState<InsightWithActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<InsightWithActionItem[]>("get_all_insights", {
        insightType,
        status,
        search,
      });
      setInsights(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [insightType, status, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decisions = insights.filter((i) => i.type === "decision");
  const actionItems = insights.filter((i) => i.type === "action_item");
  const keyMoments = insights.filter((i) => i.type === "key_moment");

  const toggleActionItem = useCallback(
    async (actionItemId: string, currentStatus: string) => {
      const newStatus = currentStatus === "done" ? "open" : "done";
      await invoke("update_action_item_status", {
        id: actionItemId,
        status: newStatus,
      });
      await refresh();
    },
    [refresh],
  );

  return {
    insights,
    decisions,
    actionItems,
    keyMoments,
    loading,
    error,
    refresh,
    toggleActionItem,
  };
}
