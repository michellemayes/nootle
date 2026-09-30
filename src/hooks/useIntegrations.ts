import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Integration } from "@/types";

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);

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
    invoke<string[]>("list_oauth_providers").then(setOauthProviders).catch(() => {});
  }, [refresh]);

  /**
   * Opens the provider's sign-in page and resolves once the user finishes,
   * with null if they cancelled.
   */
  const connectOAuth = useCallback(
    async (provider: string) => {
      const result = await invoke<Integration | null>("connect_oauth", { provider });
      if (result) await refresh();
      return result;
    },
    [refresh],
  );

  const cancelOAuth = useCallback(() => invoke("cancel_oauth"), []);

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
    oauthProviders,
    connectOAuth,
    cancelOAuth,
    createIntegration,
    updateIntegration,
    deleteIntegration,
  };
}
