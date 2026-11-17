import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "@/components/Toaster";

/** Closes the popped-out window, which puts Live Assist back beside the notes. */
export const popInLiveAssist = () => {
  invoke("close_live_assist_window").catch(() => {});
};

/** Whether Live Assist is popped out into its own window, and moving it. */
export function useLiveAssistWindow() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    invoke<string | null>("live_assist_window_meeting")
      .then((id) => setOpen(Boolean(id)))
      .catch(() => {});
    const unlisten = listen<boolean>("live-assist-window", (event) => setOpen(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const popOut = useCallback((meetingId: string) => {
    invoke("open_live_assist_window", { meetingId }).catch((err) => toast(String(err)));
  }, []);
  return { open, popOut, popIn: popInLiveAssist };
}
