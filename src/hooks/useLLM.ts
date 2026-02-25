import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "@/types";

export function useLLM() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [modelsResult, providersResult] = await Promise.all([
        invoke<ModelInfo[]>("list_llm_models"),
        invoke<string[]>("list_llm_providers"),
      ]);
      setModels(modelsResult);
      setProviders(providersResult);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { models, providers, loading, error, refresh };
}
