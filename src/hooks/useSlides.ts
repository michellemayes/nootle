import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Slide, Snapshot } from "@/types";

/** A meeting's snapshots as numbered slides, with their recaps. */
export function useSlides(meetingId: string) {
  const [slides, setSlides] = useState<Slide[]>([]);

  const refresh = useCallback(() => {
    invoke<Slide[]>("list_slides", { meetingId })
      .then(setSlides)
      .catch(() => {});
  }, [meetingId]);

  useEffect(() => {
    setSlides([]);
    refresh();
    // Recaps are written alongside automatic summaries.
    const unlistenSummaries = listen<string>("summaries-updated", (event) => {
      if (event.payload === meetingId) refresh();
    });
    const unlistenTaken = listen<Snapshot>("snapshot-taken", (event) => {
      if (event.payload.meeting_id === meetingId) refresh();
    });
    const unlistenRemoved = listen<string>("snapshot-removed", (event) => {
      if (event.payload === meetingId) refresh();
    });
    return () => {
      for (const unlisten of [unlistenSummaries, unlistenTaken, unlistenRemoved]) {
        unlisten.then((fn) => fn());
      }
    };
  }, [meetingId, refresh]);

  const generateRecap = useCallback(
    async (provider: string, model: string, replace: boolean) => {
      setSlides(
        await invoke<Slide[]>("generate_slide_recap", { meetingId, provider, model, replace }),
      );
    },
    [meetingId],
  );

  return { slides, refresh, generateRecap };
}
