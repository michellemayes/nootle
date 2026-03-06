import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatConversation, ChatMessageRecord } from "@/types";

export function useChatConversations() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<ChatConversation[]>("list_chat_conversations");
      setConversations(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createConversation = useCallback(async () => {
    const conv = await invoke<ChatConversation>("create_chat_conversation");
    await refresh();
    return conv;
  }, [refresh]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await invoke("delete_chat_conversation", { id });
      await refresh();
    },
    [refresh],
  );

  const updateTitle = useCallback(
    async (id: string, title: string) => {
      await invoke("update_chat_conversation_title", { id, title });
      await refresh();
    },
    [refresh],
  );

  return { conversations, loading, error, refresh, createConversation, deleteConversation, updateTitle };
}

export function useChatMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<ChatMessageRecord[]>("list_chat_messages", {
        conversationId,
      });
      setMessages(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { messages, loading, error, refresh };
}
