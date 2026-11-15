import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { announceProvidersChanged } from "@/hooks/useLLM";

/** An OpenAI-compatible endpoint: `chat` for summaries and Ask, `transcription` for transcripts. */
export type EndpointKind = "chat" | "transcription";

export interface CustomEndpoint {
  base_url: string;
  models: string[];
  has_key: boolean;
}

const CHANGED = "custom-endpoint-changed";

export function useCustomEndpoint(kind: EndpointKind) {
  const [endpoint, setEndpoint] = useState<CustomEndpoint | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEndpoint(await invoke<CustomEndpoint | null>("get_custom_endpoint", { kind }));
    } catch {
      setEndpoint(null);
    } finally {
      setLoaded(true);
    }
  }, [kind]);

  useEffect(() => {
    refresh();
    const onChange = (e: Event) => {
      if ((e as CustomEvent<EndpointKind>).detail === kind) refresh();
    };
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [kind, refresh]);

  const announce = () => {
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: kind }));
    if (kind === "chat") announceProvidersChanged();
  };

  /** `apiKey`: undefined keeps the saved key, "" removes it. */
  const save = async (baseUrl: string, models: string[], apiKey?: string) => {
    const saved = await invoke<CustomEndpoint>("save_custom_endpoint", {
      kind,
      baseUrl,
      models,
      apiKey,
    });
    setEndpoint(saved);
    announce();
  };

  const remove = async () => {
    await invoke("delete_custom_endpoint", { kind });
    setEndpoint(null);
    announce();
  };

  const test = () => invoke<void>("test_custom_endpoint", { kind });

  return { endpoint, loaded, save, remove, test };
}

/** Calls `onFail` when sending a finished recording to the transcription endpoint fails. */
export function useCloudTranscriptionFailures(onFail: (meetingId: string, error: string) => void) {
  const handler = useRef(onFail);
  handler.current = onFail;
  useEffect(() => {
    const unlisten = listen<{ meeting_id: string; error: string }>(
      "cloud-transcription-failed",
      (e) => handler.current(e.payload.meeting_id, e.payload.error),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
