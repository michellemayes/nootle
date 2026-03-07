import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLLM } from "@/hooks/useLLM";
import type { ModelInfo } from "@/types";

interface LLMSelectionContextValue {
  providers: string[];
  models: ModelInfo[];
  selectedProvider: string;
  selectedModel: string;
  filteredModels: ModelInfo[];
  changeProvider: (provider: string) => void;
  setSelectedModel: (model: string) => void;
  loading: boolean;
}

const LLMSelectionContext = createContext<LLMSelectionContextValue | null>(null);

export function LLMSelectionProvider({ children }: { children: React.ReactNode }) {
  const { models, providers, loading } = useLLM();
  const [selectedProvider, setSelectedProvider] = useState(
    () => localStorage.getItem("llm_provider") ?? ""
  );
  const [selectedModel, setSelectedModelState] = useState(
    () => localStorage.getItem("llm_model") ?? ""
  );

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      const p = providers[0];
      setSelectedProvider(p);
      localStorage.setItem("llm_provider", p);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider || models.length === 0) return;
    const providerModels = models.filter((m) => m.provider === selectedProvider);
    if (providerModels.length > 0 && !providerModels.some((m) => m.id === selectedModel)) {
      const m = providerModels[0].id;
      setSelectedModelState(m);
      localStorage.setItem("llm_model", m);
    }
  }, [selectedProvider, models, selectedModel]);

  const changeProvider = useCallback((provider: string) => {
    setSelectedProvider(provider);
    localStorage.setItem("llm_provider", provider);
    setSelectedModelState("");
    localStorage.removeItem("llm_model");
  }, []);

  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(model);
    localStorage.setItem("llm_model", model);
  }, []);

  const filteredModels = models.filter((m) => m.provider === selectedProvider);

  return (
    <LLMSelectionContext.Provider
      value={{
        providers,
        models,
        selectedProvider,
        selectedModel,
        filteredModels,
        changeProvider,
        setSelectedModel,
        loading,
      }}
    >
      {children}
    </LLMSelectionContext.Provider>
  );
}

export function useGlobalLLMSelection() {
  const ctx = useContext(LLMSelectionContext);
  if (!ctx) throw new Error("useGlobalLLMSelection must be used within LLMSelectionProvider");
  return ctx;
}
