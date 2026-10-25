import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MeetingTranslation } from "@/types";

/**
 * A meeting's saved translations, the one on screen (if any), and
 * translating it into another language.
 */
export function useTranslations(meetingId: string | null) {
  const [translations, setTranslations] = useState<MeetingTranslation[]>([]);
  /** The language the meeting is shown in, or null for the original. */
  const [showing, setShowing] = useState<string | null>(null);
  /** The language being translated into, while it runs. */
  const [translating, setTranslating] = useState<string | null>(null);

  useEffect(() => {
    setTranslations([]);
    setShowing(null);
    if (!meetingId) return;
    invoke<MeetingTranslation[]>("list_meeting_translations", { meetingId })
      .then(setTranslations)
      .catch(() => {});
  }, [meetingId]);

  /** Translates into `language` (again, if it was before) and shows it. */
  const translate = useCallback(
    async (language: string, provider: string, model: string) => {
      if (!meetingId) return;
      setTranslating(language);
      try {
        const done = await invoke<MeetingTranslation>("translate_meeting", { meetingId, language, provider, model });
        setTranslations((prev) => [...prev.filter((t) => t.language !== done.language), done]);
        setShowing(done.language);
      } finally {
        setTranslating(null);
      }
    },
    [meetingId],
  );

  const translation = useMemo(() => translations.find((t) => t.language === showing), [translations, showing]);

  return { translations, translation, show: setShowing, translating, translate };
}
