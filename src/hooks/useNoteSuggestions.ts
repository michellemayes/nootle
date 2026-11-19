import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useBooleanSetting } from "@/hooks/useBooleanSetting";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import type { FetchSuggestion, Suggestion } from "@/lib/noteSuggestion";

/** Turns inline note suggestions on. On unless turned off. */
export const NOTE_SUGGESTIONS_SETTING = "note_suggestions";

// The backend reads no more than this either side of the cursor.
const NOTES_BEFORE_CHARS = 3_000;
const NOTES_AFTER_CHARS = 800;

/** Asks the model picked in the sidebar how a meeting's notes go on at the
 * cursor; null while suggestions are off or no model is picked. */
export function useNoteSuggestions(meetingId: string | null): FetchSuggestion | null {
  const [enabled] = useBooleanSetting(NOTE_SUGGESTIONS_SETTING, true);
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  return useMemo(() => {
    if (!enabled || !meetingId || !selectedProvider || !selectedModel) return null;
    return (before, after) =>
      invoke<Suggestion | null>("suggest_note_continuation", {
        meetingId,
        before: before.slice(-NOTES_BEFORE_CHARS),
        after: after.slice(0, NOTES_AFTER_CHARS),
        provider: selectedProvider,
        model: selectedModel,
      });
  }, [enabled, meetingId, selectedProvider, selectedModel]);
}
