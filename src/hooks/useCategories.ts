import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Category } from "@/types";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Category[]>("list_categories");
      setCategories(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCategory = useCallback(
    async (name: string, color?: string, icon?: string) => {
      const category = await invoke<Category>("create_category", {
        name,
        color: color ?? null,
        icon: icon ?? null,
      });
      await refresh();
      return category;
    },
    [refresh],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      await invoke("delete_category", { id });
      await refresh();
    },
    [refresh],
  );

  return { categories, loading, error, refresh, createCategory, deleteCategory };
}
