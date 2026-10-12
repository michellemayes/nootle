import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { KnowledgeSource } from "@/types";

/** The knowledge base's sources and tags, kept current as indexing runs. */
export function useKnowledge() {
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [list, allTags] = await Promise.all([
        invoke<KnowledgeSource[]>("list_knowledge_sources"),
        invoke<string[]>("list_knowledge_tags"),
      ]);
      setSources(list);
      setTags(allTags);
    } catch {
      setSources((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("knowledge-updated", () => refresh());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const addSource = useCallback(
    async (kind: KnowledgeSource["kind"], location: string, sourceTags: string[] = []) => {
      await invoke("add_knowledge_source", { kind, location, tags: sourceTags });
      await refresh();
    },
    [refresh],
  );

  const removeSource = useCallback(
    async (id: string) => {
      await invoke("remove_knowledge_source", { id });
      await refresh();
    },
    [refresh],
  );

  const setSourceTags = useCallback(
    async (id: string, sourceTags: string[]) => {
      await invoke("update_knowledge_source_tags", { id, tags: sourceTags });
      await refresh();
    },
    [refresh],
  );

  const reindex = useCallback((id?: string) => invoke("reindex_knowledge", { id: id ?? null }), []);

  return { sources, tags, addSource, removeSource, setSourceTags, reindex };
}

/** Just the tags, for filters elsewhere in the app. */
export function useKnowledgeTags() {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    invoke<string[]>("list_knowledge_tags").then(setTags).catch(() => {});
  }, []);
  return tags;
}
