import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, MeetingChatReply } from "@/types";

/**
 * A message as the model rereads it: what it changed is spelled out, so a
 * later turn knows the notes already hold what it added.
 */
function forHistory({ role, content, actions }: ChatMessage) {
  if (!actions?.length) return { role, content };
  const changes = actions
    .map((a) => (a.ok ? a.summary : `Failed: ${a.summary}`))
    .join("; ");
  return { role, content: `${content}\n\n[Changes made: ${changes}]`.trim() };
}

export function useChat(meetingId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestMessagesRef = useRef<ChatMessage[]>(messages);
  latestMessagesRef.current = messages;

  // Reset chat when switching to a different meeting so messages from a
  // previous meeting don't leak into the new one.
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [meetingId]);

  const sendMessage = useCallback(
    async (message: string, provider: string, model: string) => {
      const userMsg: ChatMessage = { role: "user", content: message };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      try {
        const response = await invoke<MeetingChatReply>("chat_with_meeting", {
          meetingId,
          message,
          // The backend adds `message` after the history itself.
          history: latestMessagesRef.current.map(forHistory),
          provider,
          model,
        });
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: response.reply,
          actions: response.actions,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        return response.reply;
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [meetingId],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, sendMessage, clearMessages };
}
