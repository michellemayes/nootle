import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

interface RemoteResult {
  action: string;
  ok: boolean;
  message: string;
  meeting_id: string | null;
}

async function notify(title: string, body: string): Promise<Notification | null> {
  if (!("Notification" in window)) return null;
  if (Notification.permission === "denied") return null;
  if (Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return null;
  }
  return new Notification(title, { body });
}

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
        const n = await notify(event.payload.title, event.payload.body);
        if (n) n.onclick = () => startRecording();
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [startRecording]);

  // Recordings started or stopped via nootle:// links happen outside the UI,
  // so always tell the user.
  useEffect(() => {
    const unlisten = listen<RemoteResult>("remote-control-result", (event) => {
      const { ok, message, meeting_id } = event.payload;
      // Only a started/stopped meeting or a failure is worth interrupting for.
      if (ok && !meeting_id) return;
      notify(ok ? "Nootle" : "Nootle: URL action failed", message);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return { startRecording };
}
