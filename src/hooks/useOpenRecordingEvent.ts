import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

/** Shows the recording once it's started from the meeting pop-up window. */
export function useOpenRecordingEvent() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlisten = listen("open-recording", () => navigate("/recording"));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigate]);
}
