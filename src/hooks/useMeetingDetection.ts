import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

export function useMeetingDetection() {
  const navigate = useNavigate();

  const startRecording = useCallback(async () => {
    try {
      await invoke("start_recording", {
        title: "Detected Meeting",
        calendarEventId: null,
        templateId: null,
      });
      navigate("/recording");
    } catch (err) {
      console.error("Failed to start recording from notification:", err);
    }
  }, [navigate]);

  useEffect(() => {
    const unlisten = listen<{ title: string; body: string }>(
      "meeting-detected-notify",
      async (event) => {
        if (!("Notification" in window)) return;

        let permission = Notification.permission;
        if (permission === "denied") return;

        if (permission !== "granted") {
          permission = await Notification.requestPermission();
        }

        if (permission === "granted") {
          const n = new Notification(event.payload.title, {
            body: event.payload.body,
          });
          n.onclick = () => {
            startRecording();
          };
        }
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [startRecording]);

  return { startRecording };
}
