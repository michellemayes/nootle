import { useEffect, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import type { DetectedMeeting } from "@/types";

export function useMeetingDetection() {
  const navigate = useNavigate();
  // The backend sends the system notification, but desktop notifications
  // can't carry a click action, so the prompt to record lives in the app.
  const [detected, setDetected] = useState<DetectedMeeting | null>(null);

  const dismiss = useCallback(() => setDetected(null), []);

  const startRecording = useCallback(async () => {
    setDetected(null);
    try {
      await invoke("start_recording", {
        title: "Detected Meeting",
        calendarEventId: null,
        templateId: null,
      });
      navigate("/recording");
    } catch (err) {
      console.error("Failed to start recording from detected meeting:", err);
    }
  }, [navigate]);

  useEffect(() => {
    const unlisten = listen<DetectedMeeting>("meeting-detected", (event) => setDetected(event.payload));

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return { detected, startRecording, dismiss };
}
