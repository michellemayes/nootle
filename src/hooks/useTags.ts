import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Tag, MeetingTagEntry } from "@/types";

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map of meeting_id -> Tag[]
  const [meetingTagsMap, setMeetingTagsMap] = useState<
    Record<string, Tag[]>
  >({});

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Tag[]>("list_tags");
      setTags(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMeetingTags = useCallback(async () => {
    try {
      const entries = await invoke<MeetingTagEntry[]>("get_all_meeting_tags");
      const map: Record<string, Tag[]> = {};
      for (const entry of entries) {
        if (!map[entry.meeting_id]) {
          map[entry.meeting_id] = [];
        }
        map[entry.meeting_id].push(entry.tag);
      }
      setMeetingTagsMap(map);
    } catch {
      // silently fail — meeting tags are supplemental
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshMeetingTags();
  }, [refresh, refreshMeetingTags]);

  const createTag = useCallback(
    async (name: string, color: string) => {
      const tag = await invoke<Tag>("create_tag", { name, color });
      await refresh();
      return tag;
    },
    [refresh],
  );

  const updateTag = useCallback(
    async (id: string, name: string, color: string) => {
      const tag = await invoke<Tag>("update_tag", { id, name, color });
      await refresh();
      return tag;
    },
    [refresh],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      await invoke("delete_tag", { id });
      await refresh();
      await refreshMeetingTags();
    },
    [refresh, refreshMeetingTags],
  );

  const addMeetingTag = useCallback(
    async (meetingId: string, tagId: string) => {
      await invoke("add_meeting_tag", { meetingId, tagId });
      await refreshMeetingTags();
    },
    [refreshMeetingTags],
  );

  const removeMeetingTag = useCallback(
    async (meetingId: string, tagId: string) => {
      await invoke("remove_meeting_tag", { meetingId, tagId });
      await refreshMeetingTags();
    },
    [refreshMeetingTags],
  );

  const getMeetingTags = useCallback(
    async (meetingId: string): Promise<Tag[]> => {
      return invoke<Tag[]>("get_meeting_tags", { meetingId });
    },
    [],
  );

  return {
    tags,
    loading,
    error,
    meetingTagsMap,
    refresh,
    refreshMeetingTags,
    createTag,
    updateTag,
    deleteTag,
    addMeetingTag,
    removeMeetingTag,
    getMeetingTags,
  };
}
