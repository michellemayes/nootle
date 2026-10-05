import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DictionaryEntry } from "@/types";

/** Splits a comma-separated list of misheard variants. */
export function parseVariants(text: string): string[] {
  return text
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function useDictionary() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setEntries(await invoke<DictionaryEntry[]>("list_dictionary_entries"));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (command: string, args: Record<string, unknown>) => {
      await invoke(command, args);
      await refresh();
    },
    [refresh],
  );

  const addEntry = (term: string, misheard: string[]) =>
    mutate("add_dictionary_entry", { term, misheard });
  const updateEntry = (id: string, term: string, misheard: string[]) =>
    mutate("update_dictionary_entry", { id, term, misheard });
  const deleteEntry = (id: string) => mutate("delete_dictionary_entry", { id });

  return { entries, error, addEntry, updateEntry, deleteEntry };
}
