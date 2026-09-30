import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Meeting } from "@/types";

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkRecording = useCallback(async () => {
    try {
      const recording = await invoke<boolean>("is_recording");
      setIsRecording(recording);
    } catch {
    }
  }, []);

  useEffect(() => {
    checkRecording();
  }, [checkRecording]);

  useEffect(() => {
    if (!isRecording) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(
    async (title: string, calendarEventId?: string, templateId?: string) => {
      setError(null);
      try {
        const meeting = await invoke<Meeting>("start_recording", {
          title,
          calendarEventId: calendarEventId ?? null,
          templateId: templateId ?? null,
        });
        setCurrentMeeting(meeting);
        setIsRecording(true);
        return meeting;
      } catch (err) {
        const message = String(err);
        setError(message);
        throw err;
      }
    },
    [],
  );

  // Pick up a recording that is already running (started from a meeting
  // notification, or the user navigated away and came back) instead of
  // starting a second one, which the backend would reject.
  const resumeRecording = useCallback(async () => {
    if (!(await invoke<boolean>("is_recording"))) return null;
    const meetings = await invoke<Meeting[]>("list_meetings", {
      search: null,
      includeArchived: false,
    });
    const live = meetings.find((m) => m.status === "recording") ?? null;
    if (live) {
      setCurrentMeeting(live);
      setElapsed(
        Math.max(0, Math.floor((Date.now() - new Date(live.start_time).getTime()) / 1000)),
      );
    }
    setIsRecording(true);
    return live;
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const meeting = await invoke<Meeting>("stop_recording");
      setCurrentMeeting(meeting);
      return meeting;
    } finally {
      setIsRecording(false);
      setElapsed(0);
    }
  }, []);

  return {
    isRecording,
    currentMeeting,
    elapsed,
    error,
    startRecording,
    resumeRecording,
    stopRecording,
  };
}

/**
 * Lightweight "is anything recording?" check for chrome outside the
 * recording view. Re-checks on every navigation, since starting and stopping
 * both route through /recording.
 */
export function useIsRecording(pathname: string) {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    invoke<boolean>("is_recording")
      .then(setRecording)
      .catch(() => {});
  }, [pathname]);
  return recording;
}
