import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InsightType } from "@/types";

export function useInsightTypes() {
  const [types, setTypes] = useState<InsightType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<InsightType[]>("list_insight_types");
      setTypes(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createInsightType = useCallback(
    async (
      name: string,
      slug: string,
      description: string | null,
      extractionPrompt: string,
      icon: string,
      hasActionFields: boolean,
    ) => {
      const result = await invoke<InsightType>("create_insight_type", {
        name,
        slug,
        description,
        extractionPrompt,
        icon,
        hasActionFields,
      });
      await refresh();
      return result;
    },
    [refresh],
  );

  const updateInsightType = useCallback(
    async (
      id: string,
      name: string,
      description: string | null,
      extractionPrompt: string,
      icon: string,
      hasActionFields: boolean,
    ) => {
      const result = await invoke<InsightType>("update_insight_type", {
        id,
        name,
        description,
        extractionPrompt,
        icon,
        hasActionFields,
      });
      await refresh();
      return result;
    },
    [refresh],
  );

  const deleteInsightType = useCallback(
    async (id: string) => {
      await invoke("delete_insight_type", { id });
      await refresh();
    },
    [refresh],
  );

  return { types, loading, error, refresh, createInsightType, updateInsightType, deleteInsightType };
}
