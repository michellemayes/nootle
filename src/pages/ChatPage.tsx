import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";
import { ThinkingDots } from "@/components/ThinkingDots";
import { useChatConversations, useChatMessages } from "@/hooks/useChatHistory";
import { useCategories } from "@/hooks/useCategories";
import { useLLM } from "@/hooks/useLLM";
import type { ChatSource, GlobalChatResponse } from "@/types";
import { Plus, Trash2, MessageSquare, Send } from "lucide-react";

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
] as const;

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function SourceCitation({
  source,
  onClick,
}: {
  source: ChatSource;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors"
    >
      {source.meeting_title}, {formatTimestamp(source.start_ms)}
    </button>
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const { conversations, refresh: refreshConvos, createConversation, deleteConversation } =
    useChatConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { messages: dbMessages, refresh: refreshMessages } = useChatMessages(activeId);
  const { categories } = useCategories();
  const { models, providers } = useLLM();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedDatePreset, setSelectedDatePreset] = useState(3);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default provider/model
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

  // Auto-select first conversation
  useEffect(() => {
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dbMessages]);

  const filteredModels = models.filter((m) => m.provider === selectedProvider);

  const dateFrom = useCallback(() => {
    const preset = DATE_PRESETS[selectedDatePreset];
    return preset.days
      ? new Date(Date.now() - preset.days * 86400000).toISOString()
      : null;
  }, [selectedDatePreset]);

  const handleNewConversation = async () => {
    const conv = await createConversation();
    setActiveId(conv.id);
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    if (activeId === id) {
      setActiveId(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedProvider || !selectedModel || !activeId) return;
    const msg = input;
    setInput("");
    setLoading(true);
    try {
      await invoke<GlobalChatResponse>("send_chat_message", {
        conversationId: activeId,
        message: msg,
        provider: selectedProvider,
        model: selectedModel,
        categoryIds: selectedCategory ? [selectedCategory] : [],
        dateFrom: dateFrom(),
        dateTo: null,
      });
      await refreshMessages();
      await refreshConvos();
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Parse sources from a message's sources_json field
  const parseSources = (sourcesJson: string | null): ChatSource[] => {
    if (!sourcesJson) return [];
    try {
      return JSON.parse(sourcesJson);
    } catch {
      return [];
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel - conversation list */}
      <div className="flex w-64 flex-col border-r bg-card">
        <div className="flex items-center justify-between px-4 h-12 border-b">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <Button variant="ghost" size="icon-sm" onClick={handleNewConversation}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
                onClick={() => setActiveId(conv.id)}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate text-sm">{conv.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel - chat */}
      <div className="flex flex-1 flex-col">
        {/* Filters bar */}
        <div className="flex items-center gap-3 px-4 h-12 border-b">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-7 rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={selectedDatePreset}
            onChange={(e) => setSelectedDatePreset(Number(e.target.value))}
            className="h-7 rounded-md border bg-transparent px-2 text-xs"
          >
            {DATE_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
          <select
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value);
              setSelectedModel("");
            }}
            className="h-7 rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">Provider</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="h-7 rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">Model</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Messages area */}
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center space-y-3">
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                Create a conversation to start chatting with your meetings
              </p>
              <Button size="sm" onClick={handleNewConversation}>
                <Plus className="h-4 w-4 mr-1" /> New Conversation
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {dbMessages.length === 0 && !loading && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">
                    Ask a question about your meetings
                  </p>
                </div>
              )}
              {dbMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <Markdown content={msg.content} />
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.role === "assistant" && (() => {
                      const sources = parseSources(msg.sources_json);
                      return sources.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {sources.map((s, i) => (
                            <SourceCitation
                              key={i}
                              source={s}
                              onClick={() => navigate(`/meeting/${s.meeting_id}`)}
                            />
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2.5">
                    <ThinkingDots />
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your meetings..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={loading || !selectedProvider || !selectedModel}
                />
                <Button
                  onClick={handleSend}
                  disabled={loading || !input.trim() || !selectedProvider || !selectedModel}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
