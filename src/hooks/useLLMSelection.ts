import { useState, useEffect, useCallback } from "react";
import type { ModelInfo } from "@/types";

export function useLLMSelection(providers: string[], models: ModelInfo[]) {
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (selectedProvider && models.length > 0 && !selectedModel) {
      const providerModels = models.filter((m) => m.provider === selectedProvider);
      if (providerModels.length > 0) {
        setSelectedModel(providerModels[0].id);
      }
    }
  }, [selectedProvider, models, selectedModel]);

  const changeProvider = useCallback((provider: string) => {
    setSelectedProvider(provider);
    setSelectedModel("");
  }, []);

  const filteredModels = models.filter((m) => m.provider === selectedProvider);

  return {
    selectedProvider,
    selectedModel,
    setSelectedModel,
    changeProvider,
    filteredModels,
  };
}
