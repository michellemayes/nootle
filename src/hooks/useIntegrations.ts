import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Integration } from "@/types";

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<Integration[]>("list_integrations");
      setIntegrations(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createIntegration = useCallback(
    async (
      integrationType: string,
      name: string,
      credentialsJson: string,
    ) => {
      const result = await invoke<Integration>("create_integration", {
        integrationType,
        name,
        credentialsJson,
      });
      await refresh();
      return result;
    },
    [refresh],
  );

  const updateIntegration = useCallback(
    async (id: string, name: string, credentialsJson: string) => {
      const result = await invoke<Integration>("update_integration", {
        id,
        name,
        credentialsJson,
      });
      await refresh();
      return result;
    },
    [refresh],
  );

  const deleteIntegration = useCallback(
    async (id: string) => {
      await invoke("delete_integration", { id });
      await refresh();
    },
    [refresh],
  );

  return {
    integrations,
    loading,
    error,
    refresh,
    createIntegration,
    updateIntegration,
    deleteIntegration,
  };
}
