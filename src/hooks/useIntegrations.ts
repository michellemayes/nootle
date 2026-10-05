import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Integration } from "@/types";

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [githubCliAvailable, setGithubCliAvailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
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
    invoke<boolean>("github_cli_available").then(setGithubCliAvailable).catch(() => {});
  }, [refresh]);

  /**
   * Opens the provider's sign-in page and resolves once the user finishes,
   * with null if they cancelled.
   */
  const signIn = useCallback(
    async (provider: string) => {
      const result = await invoke<Integration | null>("connect_integration_sign_in", { provider });
      if (result) await refresh();
      return result;
    },
    [refresh],
  );

  const cancelSignIn = useCallback(() => invoke("cancel_integration_sign_in"), []);

  /** Connects GitHub with the GitHub CLI's existing sign-in. */
  const connectGithubCli = useCallback(async () => {
    const result = await invoke<Integration>("connect_github_cli");
    await refresh();
    return result;
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
    signIn,
    cancelSignIn,
    githubCliAvailable,
    connectGithubCli,
    createIntegration,
    updateIntegration,
    deleteIntegration,
  };
}
