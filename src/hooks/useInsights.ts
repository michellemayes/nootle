import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "@/components/Toaster";
import type { InsightWithActionItem, InsightType } from "@/types";

function groupInsightsByType(
  insights: InsightWithActionItem[],
  insightTypes: InsightType[],
): Record<string, InsightWithActionItem[]> {
  const map: Record<string, InsightWithActionItem[]> = {};
  for (const t of insightTypes) {
    map[t.slug] = [];
  }
  for (const i of insights) {
    if (!map[i.type]) map[i.type] = [];
    map[i.type].push(i);
  }
  return map;
}

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

  const groupedByType = useMemo(
    () => groupInsightsByType(insights, insightTypes),
    [insights, insightTypes],
  );

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
      await fetchInsights(true);
    },
    [fetchInsights],
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
      await fetchInsights(true);
    },
    [fetchInsights],
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

  const groupedByType = useMemo(
    () => groupInsightsByType(insights, insightTypes),
    [insights, insightTypes],
  );

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

  /** Clears insights from the feed at once, with an Undo. Their meetings keep them. */
  const dismiss = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const gone = new Set(ids);
      setInsights((prev) => prev.filter((i) => !gone.has(i.id)));
      try {
        await invoke("set_insights_dismissed", { ids, dismissed: true });
      } catch (err) {
        toast(`Couldn't dismiss: ${err}`);
        await refresh();
        return;
      }
      toast(ids.length === 1 ? "Dismissed" : `Dismissed ${ids.length}`, {
        action: {
          label: "Undo",
          onClick: () => {
            invoke("set_insights_dismissed", { ids, dismissed: false }).then(refresh, (err) =>
              toast(`Couldn't restore: ${err}`),
            );
          },
        },
      });
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
    dismiss,
  };
}
