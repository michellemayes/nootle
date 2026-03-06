import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Workflow, WorkflowRun } from "@/types";

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<Workflow[]>("list_workflows");
      setWorkflows(result);
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

  const createWorkflow = useCallback(
    async (
      name: string,
      description: string | null,
      icon: string | null,
      integrationId: string,
      actionType: string,
      configJson: string,
    ) => {
      const result = await invoke<Workflow>("create_workflow", {
        name,
        description,
        icon,
        integrationId,
        actionType,
        configJson,
      });
      await refresh();
      return result;
    },
    [refresh],
  );

  const updateWorkflow = useCallback(
    async (
      id: string,
      name: string,
      description: string | null,
      icon: string | null,
      actionType: string,
      configJson: string,
      isEnabled: boolean,
    ) => {
      const result = await invoke<Workflow>("update_workflow", {
        id,
        name,
        description,
        icon,
        actionType,
        configJson,
        isEnabled,
      });
      await refresh();
      return result;
    },
    [refresh],
  );

  const deleteWorkflow = useCallback(
    async (id: string) => {
      await invoke("delete_workflow", { id });
      await refresh();
    },
    [refresh],
  );

  const runWorkflow = useCallback(
    async (meetingId: string, workflowId: string) => {
      return await invoke<WorkflowRun>("run_workflow", {
        meetingId,
        workflowId,
      });
    },
    [],
  );

  return {
    workflows,
    loading,
    error,
    refresh,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    runWorkflow,
  };
}

export function useWorkflowRuns(meetingId: string | undefined) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!meetingId) return;
    try {
      setLoading(true);
      const result = await invoke<WorkflowRun[]>("list_workflow_runs", {
        meetingId,
      });
      setRuns(result);
    } catch {
      // silent — runs are optional display data
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runs, loading, refresh };
}
