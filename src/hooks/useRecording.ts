import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Meeting } from "@/types";

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkRecording = useCallback(async () => {
    try {
      const recording = await invoke<boolean>("is_recording");
      setIsRecording(recording);
    } catch {
      // Ignore errors during check
    }
  }, []);

  useEffect(() => {
    checkRecording();
  }, [checkRecording]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(
    async (title: string, categoryId?: string, calendarEventId?: string) => {
      const meeting = await invoke<Meeting>("start_recording", {
        title,
        categoryId: categoryId ?? null,
        calendarEventId: calendarEventId ?? null,
      });
      setCurrentMeeting(meeting);
      setIsRecording(true);
      return meeting;
    },
    [],
  );

  const stopRecording = useCallback(async () => {
    const meeting = await invoke<Meeting>("stop_recording");
    setCurrentMeeting(meeting);
    setIsRecording(false);
    return meeting;
  }, []);

  return {
    isRecording,
    currentMeeting,
    elapsed,
    startRecording,
    stopRecording,
  };
}
