import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

/** Shows the recording once it's started from the meeting pop-up or brief
 * window, and a meeting's notes opened from the brief. */
export function useOpenRecordingEvent() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlistenRecording = listen("open-recording", () => navigate("/recording"));
    const unlistenMeeting = listen<string>("open-meeting", (event) =>
      navigate(`/meeting/${event.payload}`),
    );
    return () => {
      unlistenRecording.then((fn) => fn());
      unlistenMeeting.then((fn) => fn());
    };
  }, [navigate]);
}
