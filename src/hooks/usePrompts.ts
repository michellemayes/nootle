import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Prompt } from "@/types";

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Prompt[]>("list_prompts");
      setPrompts(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createPrompt = useCallback(
    async (
      name: string,
      content: string,
      isFavorite: boolean,
      isAutoRun: boolean,
    ) => {
      const prompt = await invoke<Prompt>("create_prompt", {
        name,
        content,
        isFavorite,
        isAutoRun,
      });
      await refresh();
      return prompt;
    },
    [refresh],
  );

  const deletePrompt = useCallback(
    async (id: string) => {
      await invoke("delete_prompt", { id });
      await refresh();
    },
    [refresh],
  );

  const updatePrompt = useCallback(
    async (
      id: string,
      name: string,
      content: string,
      isFavorite: boolean,
      isAutoRun: boolean,
    ) => {
      const prompt = await invoke<Prompt>("update_prompt", {
        id,
        name,
        content,
        isFavorite,
        isAutoRun,
      });
      await refresh();
      return prompt;
    },
    [refresh],
  );

  return { prompts, loading, error, refresh, createPrompt, updatePrompt, deletePrompt };
}
