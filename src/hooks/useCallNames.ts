import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Names read off a meeting's call window that no speaker has yet, fetched
 * while `active` (e.g. while a speaker is being renamed). */
export function useCallNames(meetingId: string | null, active: boolean) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!meetingId || !active) return;
    let cancelled = false;
    invoke<string[]>("get_call_names", { meetingId })
      .then((result) => {
        if (!cancelled) setNames(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [meetingId, active]);

  return names;
}
