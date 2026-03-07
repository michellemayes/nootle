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
    if (!isRecording) {
      setElapsed(0);
      return;
    }
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

  const stopRecording = useCallback(async () => {
    try {
      const meeting = await invoke<Meeting>("stop_recording");
      setCurrentMeeting(meeting);
      return meeting;
    } finally {
      setIsRecording(false);
    }
  }, []);

  return {
    isRecording,
    currentMeeting,
    elapsed,
    error,
    startRecording,
    stopRecording,
  };
}
