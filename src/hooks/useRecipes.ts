import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Recipe } from "@/types";

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Recipe[]>("list_recipes");
      setRecipes(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createRecipe = useCallback(
    async (
      name: string,
      description: string,
      slashCommand: string,
      promptTemplate: string,
      outputFormat: string,
    ) => {
      const recipe = await invoke<Recipe>("create_recipe", {
        name,
        description,
        slashCommand,
        promptTemplate,
        outputFormat,
      });
      await refresh();
      return recipe;
    },
    [refresh],
  );

  const updateRecipe = useCallback(
    async (
      id: string,
      name: string,
      description: string,
      slashCommand: string,
      promptTemplate: string,
      outputFormat: string,
    ) => {
      const recipe = await invoke<Recipe>("update_recipe", {
        id,
        name,
        description,
        slashCommand,
        promptTemplate,
        outputFormat,
      });
      await refresh();
      return recipe;
    },
    [refresh],
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      await invoke("delete_recipe", { id });
      await refresh();
    },
    [refresh],
  );

  const runRecipe = useCallback(
    async (
      meetingId: string,
      recipeId: string,
      provider: string,
      model: string,
    ) => {
      return invoke<string>("run_recipe", {
        meetingId,
        recipeId,
        provider,
        model,
      });
    },
    [],
  );

  return {
    recipes,
    loading,
    error,
    refresh,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    runRecipe,
  };
}
