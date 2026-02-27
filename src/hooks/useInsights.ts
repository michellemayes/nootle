import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { InsightWithActionItem, InsightType } from "@/types";

export function useInsights(meetingId: string) {
  const [insights, setInsights] = useState<InsightWithActionItem[]>([]);
  const [insightTypes, setInsightTypes] = useState<InsightType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core fetch — quiet=true skips the loading spinner (used after extraction)
  const fetchInsights = useCallback(async (quiet: boolean) => {
    try {
      if (!quiet) setLoading(true);
      setError(null);
      const [result, types] = await Promise.all([
        invoke<InsightWithActionItem[]>("get_insights", { meetingId }),
        invoke<InsightType[]>("list_insight_types"),
      ]);
      setInsights(result);
      setInsightTypes(types);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  const refresh = useCallback(() => fetchInsights(false), [fetchInsights]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for backend event after extraction completes
  useEffect(() => {
    const unlisten = listen<string>("insights-updated", (event) => {
      if (event.payload === meetingId) {
        fetchInsights(true);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [meetingId, fetchInsights]);

  // Group insights by type dynamically
  const groupedByType = useMemo(() => {
    const map: Record<string, InsightWithActionItem[]> = {};
    for (const t of insightTypes) {
      map[t.slug] = [];
    }
    for (const i of insights) {
      if (!map[i.type]) map[i.type] = [];
      map[i.type].push(i);
    }
    return map;
  }, [insights, insightTypes]);

  // Keep backward-compatible accessors
  const decisions = groupedByType["decision"] ?? [];
  const actionItems = groupedByType["action_item"] ?? [];
  const keyMoments = groupedByType["key_moment"] ?? [];

  const extractInsights = useCallback(
    async (provider: string, model: string) => {
      await invoke("extract_meeting_insights", {
        meetingId,
        provider,
        model,
      });
      // Quiet refresh — don't flash loading spinner, data should be ready
      await fetchInsights(true);
    },
    [meetingId, fetchInsights],
  );

  const reExtractInsights = useCallback(
    async (provider: string, model: string) => {
      await invoke("re_extract_meeting_insights", {
        meetingId,
        provider,
        model,
      });
      await fetchInsights(true);
    },
    [meetingId, fetchInsights],
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
    insightTypes,
    groupedByType,
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
  const [insightTypes, setInsightTypes] = useState<InsightType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [result, types] = await Promise.all([
        invoke<InsightWithActionItem[]>("get_all_insights", {
          insightType,
          status,
          search,
        }),
        invoke<InsightType[]>("list_insight_types"),
      ]);
      setInsights(result);
      setInsightTypes(types);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [insightType, status, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Group insights by type dynamically
  const groupedByType = useMemo(() => {
    const map: Record<string, InsightWithActionItem[]> = {};
    for (const t of insightTypes) {
      map[t.slug] = [];
    }
    for (const i of insights) {
      if (!map[i.type]) map[i.type] = [];
      map[i.type].push(i);
    }
    return map;
  }, [insights, insightTypes]);

  const decisions = groupedByType["decision"] ?? [];
  const actionItems = groupedByType["action_item"] ?? [];
  const keyMoments = groupedByType["key_moment"] ?? [];

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
    insightTypes,
    groupedByType,
    decisions,
    actionItems,
    keyMoments,
    loading,
    error,
    refresh,
    toggleActionItem,
  };
}
