import { createContext, useContext, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLLM } from "@/hooks/useLLM";
import { useSetting } from "@/hooks/useBooleanSetting";
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

// The backend's automatic work (titles, summaries after a recording) reads
// these, so the sidebar's choice is the one every summary uses. Unset, both
// sides use the first provider and its first model.
const PROVIDER_SETTING = "summarization_provider";
const MODEL_SETTING = "summarization_model";
const LEGACY_KEYS = ["llm_provider", "llm_model"] as const;

export function LLMSelectionProvider({ children }: { children: React.ReactNode }) {
  const { models, providers, loading } = useLLM();
  const [savedProvider, saveProvider] = useSetting(PROVIDER_SETTING, "");
  const [savedModel, saveModel] = useSetting(MODEL_SETTING, "");

  // Earlier versions kept the choice in this window only; move it over once.
  useEffect(() => {
    const [provider, model] = LEGACY_KEYS.map((k) => localStorage.getItem(k));
    if (!provider) return;
    invoke<string | null>("get_app_setting", { key: PROVIDER_SETTING })
      .then((saved) => {
        if (!saved) {
          saveProvider(provider);
          saveModel(model ?? "");
        }
        LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
      })
      .catch(() => {});
  }, [saveProvider, saveModel]);

  const selectedProvider = savedProvider || providers[0] || "";
  const offered = useMemo(
    () => models.filter((m) => m.provider === selectedProvider),
    [models, selectedProvider],
  );
  const selectedModel = offered.some((m) => m.id === savedModel)
    ? savedModel
    : (offered[0]?.id ?? savedModel);

  const changeProvider = useCallback(
    (provider: string) => {
      saveProvider(provider);
      saveModel("");
    },
    [saveProvider, saveModel],
  );

  const setSelectedModel = useCallback(
    (model: string) => {
      if (!savedProvider) saveProvider(selectedProvider);
      saveModel(model);
    },
    [savedProvider, selectedProvider, saveProvider, saveModel],
  );


  const value = useMemo(
    () => ({
      providers,
      models,
      selectedProvider,
      selectedModel,
      filteredModels: offered,
      changeProvider,
      setSelectedModel,
      loading,
    }),
    [providers, models, selectedProvider, selectedModel, offered, changeProvider, setSelectedModel, loading],
  );

  return (
    <LLMSelectionContext.Provider value={value}>
      {children}
    </LLMSelectionContext.Provider>
  );
}

export function useGlobalLLMSelection() {
  const ctx = useContext(LLMSelectionContext);
  if (!ctx) throw new Error("useGlobalLLMSelection must be used within LLMSelectionProvider");
  return ctx;
}
