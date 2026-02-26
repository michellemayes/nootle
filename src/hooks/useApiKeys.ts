import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useApiKeys() {
  const [storedProviders, setStoredProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<string[]>("list_stored_providers");
      setStoredProviders(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const storeKey = useCallback(
    async (provider: string, key: string) => {
      await invoke("store_api_key", { provider, key });
      await refresh();
    },
    [refresh],
  );

  const deleteKey = useCallback(
    async (provider: string) => {
      await invoke("delete_api_key", { provider });
      await refresh();
    },
    [refresh],
  );

  const hasKey = useCallback(async (provider: string) => {
    return invoke<boolean>("has_api_key", { provider });
  }, []);

  return { storedProviders, loading, error, refresh, storeKey, deleteKey, hasKey };
}
