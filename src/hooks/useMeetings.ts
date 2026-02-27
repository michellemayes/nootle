import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Meeting } from "@/types";

export function useMeetings(categoryId?: string, search?: string, includeArchived?: boolean) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Meeting[]>("list_meetings", {
        categoryId: categoryId ?? null,
        search: search ?? null,
        includeArchived: includeArchived ?? false,
      });
      setMeetings(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [categoryId, search, includeArchived]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meetings, loading, error, refresh };
}

export function useMeeting(id: string) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Meeting>("get_meeting", { id });
      setMeeting(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meeting, loading, error, refresh };
}

export async function deleteMeeting(id: string): Promise<void> {
  await invoke("delete_meeting", { id });
}

export async function archiveMeeting(id: string): Promise<void> {
  await invoke("update_meeting_status", { id, status: "archived" });
}

export async function unarchiveMeeting(id: string): Promise<void> {
  await invoke("update_meeting_status", { id, status: "summarized" });
}

export async function updateMeetingTitle(
  id: string,
  title: string,
): Promise<void> {
  await invoke("update_meeting_title", { id, title });
}

export async function updateMeetingCategory(
  id: string,
  categoryId: string | null,
): Promise<void> {
  await invoke("update_meeting_category", { id, categoryId });
}
