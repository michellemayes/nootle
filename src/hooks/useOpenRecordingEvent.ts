import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

/** Shows the recording or Settings when asked to from the meeting pop-up,
 * the menu bar or the brief window, a meeting's notes opened from the
 * brief, and any page another window links to. */
export function useOpenRecordingEvent() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlisten = [
      listen("open-recording", () => navigate("/recording")),
      listen("open-settings", () => navigate("/settings")),
      listen<string>("open-meeting", (event) => navigate(`/meeting/${event.payload}`)),
      listen<string>("open-route", (event) => navigate(event.payload)),
    ];
    return () => {
      unlisten.forEach((u) => u.then((fn) => fn()));
    };
  }, [navigate]);
}
