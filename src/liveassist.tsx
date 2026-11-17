import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ThemeProvider } from "@/hooks/useTheme";
import { LLMSelectionProvider } from "@/contexts/LLMSelectionContext";
import { LiveAssist } from "@/components/LiveAssist";
import { Toaster } from "@/components/Toaster";
import { useTranscript } from "@/hooks/useTranscripts";
import { checkIsRecording } from "@/hooks/useRecording";
import { popInLiveAssist } from "@/hooks/useLiveAssistWindow";
import "@/lib/crashReports";
import "./index.css";

const openInMain = (path: string) => invoke("open_in_main_window", { path });

function LiveAssistWindow() {
  const [meetingId, setMeetingId] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("live_assist_window_meeting").then(setMeetingId);
    // The window goes when the recording does.
    const unlisten = listen("recording-changed", async () => {
      if (!(await checkIsRecording())) popInLiveAssist();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return meetingId ? <Panel meetingId={meetingId} /> : null;
}

function Panel({ meetingId }: { meetingId: string }) {
  const { segments } = useTranscript(meetingId);
  return (
    <LiveAssist
      meetingId={meetingId}
      segments={segments}
      onOpenMeeting={openInMain}
      onPopOut={popInLiveAssist}
      windowed
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <LLMSelectionProvider>
        <LiveAssistWindow />
        <Toaster />
      </LLMSelectionProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
