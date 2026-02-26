import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  GlobalChatMessage,
  GlobalChatResponse,
  EmbeddingStatus,
} from "@/types";

export function useGlobalChat() {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(null);

  const refreshEmbeddingStatus = useCallback(async () => {
    try {
      const status = await invoke<EmbeddingStatus>("get_embedding_status");
      setEmbeddingStatus(status);
    } catch {
      // Ignore errors during status fetch
    }
  }, []);

  useEffect(() => {
    refreshEmbeddingStatus();
  }, [refreshEmbeddingStatus]);

  const sendMessage = useCallback(
    async (message: string, provider: string, model: string) => {
      const userMsg: GlobalChatMessage = { role: "user", content: message };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      try {
        // Build history from previous messages (without sources, as ChatMessage)
        const history: ChatMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await invoke<GlobalChatResponse>(
          "chat_with_transcripts",
          {
            message,
            history: [...history, { role: "user", content: message }],
            provider,
            model,
            categoryIds,
            dateFrom,
            dateTo,
          },
        );

        const assistantMsg: GlobalChatMessage = {
          role: "assistant",
          content: result.response,
          sources: result.sources,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        return result;
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [messages, categoryIds, dateFrom, dateTo],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const setFilters = useCallback(
    (cats: string[], from: string | null, to: string | null) => {
      setCategoryIds(cats);
      setDateFrom(from);
      setDateTo(to);
      // Clear conversation when filters change
      setMessages([]);
      setError(null);
    },
    [],
  );

  const embedAllMeetings = useCallback(async () => {
    try {
      await invoke("embed_all_meetings");
      await refreshEmbeddingStatus();
    } catch (err) {
      setError(String(err));
    }
  }, [refreshEmbeddingStatus]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
    categoryIds,
    dateFrom,
    dateTo,
    setFilters,
    embeddingStatus,
    refreshEmbeddingStatus,
    embedAllMeetings,
  };
}
