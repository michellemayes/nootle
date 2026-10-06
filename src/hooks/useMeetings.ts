import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Meeting } from "@/types";

// Last result per query, so returning to the library paints instantly while
// a fresh copy loads in the background.
const meetingsCache = new Map<string, Meeting[]>();

// A failed import deletes its meeting and announces it with an id-only
// payload; treat that as a removal rather than a full row.
function isDeletion(payload: Meeting): boolean {
  return !payload.status;
}

export function useMeetings(search?: string, includeArchived?: boolean) {
  const cacheKey = `${includeArchived ? 1 : 0}|${search ?? ""}`;
  const [meetings, setMeetings] = useState<Meeting[]>(() => meetingsCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !meetingsCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  // Only the latest request may update state: a slow broad search ("pla")
  // must not overwrite the results of the narrower one typed after it.
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      setError(null);
      const result = await invoke<Meeting[]>("list_meetings", {
        search: search ?? null,
        includeArchived: includeArchived ?? false,
      });
      meetingsCache.set(cacheKey, result);
      if (request === requestRef.current) setMeetings(result);
    } catch (err) {
      if (request === requestRef.current) setError(String(err));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [search, includeArchived, cacheKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep titles and statuses current while post-recording processing runs.
  // The payload is the updated row, so patch it in; a search can change
  // which rows match, so only then refetch.
  useEffect(() => {
    const unlisten = listen<Meeting>("meeting-updated", (event) => {
      const updated = event.payload;
      if (search) {
        refresh();
        return;
      }
      setMeetings((prev) => {
        if (!prev.some((m) => m.id === updated.id)) return prev;
        const next = isDeletion(updated)
          ? prev.filter((m) => m.id !== updated.id)
          : prev.map((m) => (m.id === updated.id ? updated : m));
        meetingsCache.set(cacheKey, next);
        return next;
      });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refresh, search, cacheKey]);

  return { meetings, loading, error, refresh };
}

export function useMeeting(id: string) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
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
    setLoading(true);
    refresh();
  }, [refresh]);

  // The backend sends the whole updated meeting (new title, status), so
  // apply it directly instead of refetching.
  useEffect(() => {
    const unlisten = listen<Meeting>("meeting-updated", (event) => {
      if (event.payload.id !== id) return;
      setMeeting(isDeletion(event.payload) ? null : event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [id]);

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
