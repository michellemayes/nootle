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
      categoryId: string | null,
      sections: string,
      autoApplyRules: string,
    ) => {
      const template = await invoke<Template>("create_template", {
        name,
        categoryId,
        sections,
        autoApplyRules,
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

  return { templates, loading, error, refresh, createTemplate, deleteTemplate };
}
