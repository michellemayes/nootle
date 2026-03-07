import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ChatConversation,
  GlobalChatMessage,
  GlobalChatResponse,
  EmbeddingStatus,
} from "@/types";

export function useGlobalChat() {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const pendingConversationRef = useRef<Promise<string> | null>(null);

  const refreshEmbeddingStatus = useCallback(async () => {
    try {
      const status = await invoke<EmbeddingStatus>("get_embedding_status");
      setEmbeddingStatus(status);
    } catch {
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
        // Create a conversation on first message
        if (!conversationIdRef.current) {
          if (!pendingConversationRef.current) {
            pendingConversationRef.current = invoke<ChatConversation>(
              "create_chat_conversation",
            ).then((conv) => {
              conversationIdRef.current = conv.id;
              pendingConversationRef.current = null;
              return conv.id;
            });
          }
          await pendingConversationRef.current;
        }

        const result = await invoke<GlobalChatResponse>("send_chat_message", {
          conversationId: conversationIdRef.current,
          message,
          provider,
          model,
          labelIds,
          dateFrom,
          dateTo,
        });

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
    [labelIds, dateFrom, dateTo],
  );

  const clearMessages = useCallback(() => {
    conversationIdRef.current = null;
    setMessages([]);
    setError(null);
  }, []);

  const setFilters = useCallback(
    (labels: string[], from: string | null, to: string | null) => {
      setLabelIds(labels);
      setDateFrom(from);
      setDateTo(to);
      // Clear conversation when filters change
      conversationIdRef.current = null;
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
    labelIds,
    dateFrom,
    dateTo,
    setFilters,
    embeddingStatus,
    refreshEmbeddingStatus,
    embedAllMeetings,
  };
}
