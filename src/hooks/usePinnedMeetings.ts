import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const PINNED_SETTING = "pinned_meetings";

/** Meeting IDs pinned to the top of the library, kept in app settings. */
export function usePinnedMeetings() {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    invoke<string | null>("get_app_setting", { key: PINNED_SETTING })
      .then((value) => {
        const parsed: unknown = value ? JSON.parse(value) : [];
        if (Array.isArray(parsed)) setPinnedIds(parsed.filter((v) => typeof v === "string"));
      })
      .catch(() => {});
  }, []);

  const togglePin = useCallback((meetingId: string) => {
    setPinnedIds((prev) => {
      // Newest pin first.
      const next = prev.includes(meetingId)
        ? prev.filter((id) => id !== meetingId)
        : [meetingId, ...prev];
      invoke("set_app_setting", { key: PINNED_SETTING, value: JSON.stringify(next) }).catch(() => {});
      return next;
    });
  }, []);

  return { pinnedIds, togglePin };
}
