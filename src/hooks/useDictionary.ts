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

  const addEntry = useCallback(
    async (term: string, misheard: string[]) => {
      await invoke("add_dictionary_entry", { term, misheard });
      await refresh();
    },
    [refresh],
  );

  const updateEntry = useCallback(
    async (id: string, term: string, misheard: string[]) => {
      await invoke("update_dictionary_entry", { id, term, misheard });
      await refresh();
    },
    [refresh],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await invoke("delete_dictionary_entry", { id });
      await refresh();
    },
    [refresh],
  );

  return { entries, error, refresh, addEntry, updateEntry, deleteEntry };
}
