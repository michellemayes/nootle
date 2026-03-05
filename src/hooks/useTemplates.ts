import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Template } from "@/types";

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Template[]>("list_templates");
      setTemplates(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTemplate = useCallback(
    async (
      name: string,
      description: string,
      categoryId: string | null,
      sections: string,
      autoApplyRules: string,
      prompt: string,
    ) => {
      const template = await invoke<Template>("create_template", {
        name,
        description,
        categoryId,
        sections,
        autoApplyRules,
        prompt,
      });
      await refresh();
      return template;
    },
    [refresh],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      await invoke("delete_template", { id });
      await refresh();
    },
    [refresh],
  );

  const updateTemplate = useCallback(
    async (
      id: string,
      name: string,
      description: string,
      categoryId: string | null,
      sections: string,
      autoApplyRules: string,
      prompt: string,
    ) => {
      const template = await invoke<Template>("update_template", {
        id,
        name,
        description,
        categoryId,
        sections,
        autoApplyRules,
        prompt,
      });
      await refresh();
      return template;
    },
    [refresh],
  );

  return { templates, loading, error, refresh, createTemplate, updateTemplate, deleteTemplate };
}
