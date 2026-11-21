import { useEffect, useState } from "react";

/** State kept in localStorage for one recording, under `prefix` + its id, so
 * it survives the panel moving between the recording view and its own
 * window. Other recordings' entries under `prefix` are cleared. */
export function useRecordingStore<T>(prefix: string, meetingId: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && key !== prefix + meetingId) localStorage.removeItem(key);
      }
      const stored = localStorage.getItem(prefix + meetingId);
      return stored === null ? fallback : JSON.parse(stored);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(prefix + meetingId, JSON.stringify(value));
    } catch {
      // Without storage, the state just doesn't follow the panel to a new window.
    }
  }, [prefix, meetingId, value]);
  return [value, setValue] as const;
}
