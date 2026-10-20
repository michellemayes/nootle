import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

/** Shows the recording or Settings when asked to from the meeting pop-up or
 * the menu bar. */
export function useOpenRecordingEvent() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlisten = [
      listen("open-recording", () => navigate("/recording")),
      listen("open-settings", () => navigate("/settings")),
    ];
    return () => {
      unlisten.forEach((u) => u.then((fn) => fn()));
    };
  }, [navigate]);
}
