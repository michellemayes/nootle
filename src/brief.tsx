import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { ThemeProvider } from "@/hooks/useTheme";
import { MeetingBriefView } from "@/components/MeetingBrief";
import type { MeetingBrief } from "@/types";
import "@/lib/crashReports";
import "./index.css";

/** Left alone, the brief goes away a couple of minutes into the meeting. */
const LINGER_MS = 2 * 60_000;

const dismiss = () => invoke("dismiss_brief_popup");

/** The always-on-top brief Nootle shows a few minutes before a meeting. */
function BriefPopup() {
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const [hovered, setHovered] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    invoke<MeetingBrief | null>("get_brief_popup").then(setBrief);
    const unlisten = listen<MeetingBrief>("meeting-brief-update", (event) => setBrief(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!brief || hovered) return;
    const wait = new Date(brief.event.start).getTime() + LINGER_MS - Date.now();
    const timer = setTimeout(dismiss, Math.max(wait, 30_000));
    return () => clearTimeout(timer);
  }, [brief, hovered]);

  const record = async () => {
    if (!brief) return;
    setStarting(true);
    try {
      await invoke("record_from_brief_popup", {
        title: brief.event.title,
        calendarEventId: brief.event.id,
      });
    } catch (err) {
      console.error("Failed to start recording from the meeting brief:", err);
      setStarting(false);
    }
  };

  if (!brief) return null;

  return (
    <div
      className="flex h-screen flex-col p-2 animate-in fade-in slide-in-from-top-3 zoom-in-[0.97] duration-200 motion-reduce:animate-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        role="dialog"
        aria-label={`Brief for ${brief.event.title}`}
        className="relative flex min-h-0 flex-1 flex-col rounded-2xl border bg-popover p-4 text-popover-foreground shadow-md"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <MeetingBriefView
          brief={brief}
          onRecord={record}
          recording={starting}
          onOpenMeeting={(meetingId) => invoke("open_meeting_from_brief", { meetingId })}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BriefPopup />
    </ThemeProvider>
  </React.StrictMode>,
);
