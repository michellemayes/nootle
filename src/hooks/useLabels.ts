import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Label, MeetingLabelEntry } from "@/types";

export function useLabels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [meetingLabelsMap, setMeetingLabelsMap] = useState<
    Record<string, Label[]>
  >({});

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Label[]>("list_labels");
      setLabels(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMeetingLabels = useCallback(async () => {
    try {
      const entries = await invoke<MeetingLabelEntry[]>("get_all_meeting_labels");
      const labelsByMeetingId: Record<string, Label[]> = {};
      for (const entry of entries) {
        (labelsByMeetingId[entry.meeting_id] ??= []).push(entry.label);
      }
      setMeetingLabelsMap(labelsByMeetingId);
    } catch {
      // silently fail — meeting labels are supplemental
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshMeetingLabels();
  }, [refresh, refreshMeetingLabels]);

  const createLabel = useCallback(
    async (name: string, color: string, icon: string | null) => {
      const label = await invoke<Label>("create_label", { name, color, icon });
      await refresh();
      return label;
    },
    [refresh],
  );

  const updateLabel = useCallback(
    async (id: string, name: string, color: string, icon: string | null) => {
      const label = await invoke<Label>("update_label", { id, name, color, icon });
      await refresh();
      return label;
    },
    [refresh],
  );

  const deleteLabel = useCallback(
    async (id: string) => {
      await invoke("delete_label", { id });
      await refresh();
      await refreshMeetingLabels();
    },
    [refresh, refreshMeetingLabels],
  );

  const addMeetingLabel = useCallback(
    async (meetingId: string, labelId: string) => {
      await invoke("add_meeting_label", { meetingId, labelId });
      await refreshMeetingLabels();
    },
    [refreshMeetingLabels],
  );

  const removeMeetingLabel = useCallback(
    async (meetingId: string, labelId: string) => {
      await invoke("remove_meeting_label", { meetingId, labelId });
      await refreshMeetingLabels();
    },
    [refreshMeetingLabels],
  );

  const getMeetingLabels = useCallback(
    async (meetingId: string): Promise<Label[]> => {
      return invoke<Label[]>("get_meeting_labels", { meetingId });
    },
    [],
  );

  return {
    labels,
    loading,
    error,
    meetingLabelsMap,
    refresh,
    refreshMeetingLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    addMeetingLabel,
    removeMeetingLabel,
    getMeetingLabels,
  };
}
