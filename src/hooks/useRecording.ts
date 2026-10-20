import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Meeting, RecordingStatus } from "@/types";

const checkIsRecording = () => invoke<boolean>("is_recording").catch(() => false);

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Set when the recording was stopped from the menu bar or a nootle:// link.
  const [stoppedElsewhere, setStoppedElsewhere] = useState(false);
  const stoppingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Follow pauses and stops made outside this view.
  useEffect(() => {
    if (!isRecording) return;
    const unlisten = listen("recording-changed", async () => {
      const status = await invoke<RecordingStatus | null>("recording_status").catch(() => null);
      if (status) {
        setIsPaused(status.paused);
        setElapsed(Math.floor(status.elapsed_ms / 1000));
      } else if (!stoppingRef.current) {
        setIsRecording(false);
        setIsPaused(false);
        setStoppedElsewhere(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || isPaused) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

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
    const live = await invoke<Meeting | null>("current_recording");
    if (!live) return null;
    const status = await invoke<RecordingStatus | null>("recording_status").catch(() => null);
    setCurrentMeeting(live);
    setElapsed(
      status
        ? Math.floor(status.elapsed_ms / 1000)
        : Math.max(0, Math.floor((Date.now() - new Date(live.start_time).getTime()) / 1000)),
    );
    setIsPaused(status?.paused ?? false);
    setIsRecording(true);
    return live;
  }, []);

  // Paused stretches are left out of the audio and the transcript.
  const setPaused = useCallback(async (paused: boolean) => {
    const status = await invoke<RecordingStatus>("set_recording_paused", { paused });
    setIsPaused(status.paused);
    setElapsed(Math.floor(status.elapsed_ms / 1000));
  }, []);

  const stopRecording = useCallback(async () => {
    stoppingRef.current = true;
    try {
      const meeting = await invoke<Meeting>("stop_recording");
      setCurrentMeeting(meeting);
      return meeting;
    } finally {
      stoppingRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setElapsed(0);
    }
  }, []);

  return {
    isRecording,
    isPaused,
    currentMeeting,
    elapsed,
    error,
    stoppedElsewhere,
    startRecording,
    resumeRecording,
    setPaused,
    stopRecording,
  };
}

/**
 * Lightweight "is anything recording?" check for chrome outside the
 * recording view. Re-checks on every navigation and whenever a recording
 * starts or stops.
 */
export function useIsRecording() {
  const { pathname } = useLocation();
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    checkIsRecording().then(setRecording);
  }, [pathname]);
  // Recordings also start and stop from the menu bar.
  useEffect(() => {
    const unlisten = listen("recording-changed", () => checkIsRecording().then(setRecording));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
  return recording;
}
