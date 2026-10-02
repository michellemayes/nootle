import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Mic, X } from "lucide-react";
import { ThemeProvider } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { NootleLogo } from "@/components/NootleLogo";
import type { DetectedMeeting } from "@/types";
import "./index.css";

/** Left alone, the pop-up goes away so it doesn't sit over the call forever. */
const AUTO_DISMISS_MS = 45_000;

const dismiss = () => invoke("dismiss_meeting_popup");

/** The always-on-top card Nootle shows when a meeting starts. */
function MeetingPopup() {
  const [meeting, setMeeting] = useState<DetectedMeeting | null>(null);
  const [hovered, setHovered] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    invoke<DetectedMeeting | null>("get_popup_meeting").then(setMeeting);
    const unlisten = listen<DetectedMeeting>("meeting-popup-update", (event) =>
      setMeeting(event.payload),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!meeting || hovered) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [meeting, hovered]);

  const startRecording = async () => {
    setStarting(true);
    try {
      await invoke("record_from_meeting_popup");
    } catch (err) {
      console.error("Failed to start recording from meeting pop-up:", err);
      setStarting(false);
    }
  };

  if (!meeting) return null;

  return (
    <div
      className="p-2 animate-in fade-in slide-in-from-top-3 zoom-in-[0.97] duration-200 motion-reduce:animate-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        role="status"
        className="flex h-[68px] items-center gap-3 rounded-2xl border bg-popover px-3 text-popover-foreground shadow-md"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <NootleLogo className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Meeting detected</p>
          <p className="truncate text-xs text-muted-foreground">
            {meeting.display_name} is using your mic
          </p>
        </div>
        <Button size="sm" onClick={startRecording} disabled={starting}>
          <Mic />
          Record
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="-ml-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <MeetingPopup />
    </ThemeProvider>
  </React.StrictMode>,
);
