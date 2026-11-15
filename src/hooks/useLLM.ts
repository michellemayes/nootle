import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "@/types";

const PROVIDERS_CHANGED = "llm-providers-changed";

/** Tells every model picker to reload after a key or endpoint changes. */
export function announceProvidersChanged() {
  window.dispatchEvent(new Event(PROVIDERS_CHANGED));
}

export function useLLM() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
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
    window.addEventListener(PROVIDERS_CHANGED, refresh);
    return () => window.removeEventListener(PROVIDERS_CHANGED, refresh);
  }, [refresh]);

  return { models, providers, loading, error, refresh };
}
