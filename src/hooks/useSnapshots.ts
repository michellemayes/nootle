import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Snapshot } from "@/types";

/** Whether snapshots are turned on in Settings. */
export const SNAPSHOTS_SETTING = "snapshots_enabled";

/** A meeting's snapshots, including ones taken live while it records. */
export function useSnapshots(meetingId: string | null) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    setSnapshots([]);
    if (!meetingId) return;
    let cancelled = false;
    invoke<Snapshot[]>("list_snapshots", { meetingId })
      .then((result) => {
        if (!cancelled) setSnapshots(result);
      })
      .catch(() => {});
    const unlisten = listen<Snapshot>("snapshot-taken", (event) => {
      if (event.payload.meeting_id !== meetingId) return;
      setSnapshots((prev) =>
        prev.some((s) => s.id === event.payload.id) ? prev : [...prev, event.payload],
      );
    });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [meetingId]);

  const removeSnapshot = useCallback(async (id: string) => {
    await invoke("delete_snapshot", { id });
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { snapshots, removeSnapshot };
}

/** Whether snapshots are turned on. */
export function useSnapshotsEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    invoke<string | null>("get_app_setting", { key: SNAPSHOTS_SETTING })
      .then((val) => setEnabled(val === "true"))
      .catch(() => {});
  }, []);
  return enabled;
}
