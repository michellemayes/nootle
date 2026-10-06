import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SuggestedPrompts, LIBRARY_PROMPTS } from "@/components/SuggestedPrompts";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ChatComposer, ChatMessage, ChatThinking } from "@/components/ChatMessage";
import { ResizeHandle } from "@/components/ResizeHandle";
import { useChatConversations, useChatMessages } from "@/hooks/useChatHistory";
import { useLabels } from "@/hooks/useLabels";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { useCompactMode } from "@/contexts/CompactModeContext";
import type { ChatSource, GlobalChatResponse } from "@/types";
import { Plus, Trash2, MessageSquare, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { SourceCitation } from "@/components/SourceCitation";

export function ChatPage() {
  const navigate = useNavigate();
  const { conversations, refresh: refreshConvos, createConversation, deleteConversation, updateTitle } =
    useChatConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { messages: dbMessages, refresh: refreshMessages } = useChatMessages(activeId);
  const { labels } = useLabels();
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const { isCompact } = useCompactMode();

  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [input, setInput] = useState("");
  // Shown optimistically until the stored copy arrives with the reply.
  const [pending, setPending] = useState<{ conversationId: string; text: string } | null>(null);
  const loading = pending !== null;
  const pendingHere = pending?.conversationId === activeId ? pending : null;
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [dateFromValue, setDateFromValue] = useState("");
  const [dateToValue, setDateToValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { sentinelRef } = useStickToBottom(scrollRef, pendingHere ?? dbMessages);

  // Resize state for conversation list
  const [sidebarWidth, setSidebarWidth] = useState(256);

  const showSidebar = !isCompact || sidebarOpen;

  useEffect(() => {
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);


  // A bare "YYYY-MM-DD" parses as UTC midnight; anchor both ends to local time.
  const getDateFrom = () => dateFromValue ? new Date(dateFromValue + "T00:00:00").toISOString() : null;
  const getDateTo = () => dateToValue ? new Date(dateToValue + "T23:59:59").toISOString() : null;

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

  const handleTitleSave = async (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!titleDraft.trim() || titleDraft.trim() === conv?.title) {
      setEditingTitleId(null);
      return;
    }
    await updateTitle(id, titleDraft.trim());
    setEditingTitleId(null);
  };

  const handleSend = async (text = input, conversationId = activeId) => {
    if (!text.trim() || !selectedProvider || !selectedModel || !conversationId) return;
    setInput("");
    setPending({ conversationId, text });
    setSendError(null);
    try {
      await invoke<GlobalChatResponse>("send_chat_message", {
        conversationId,
        message: text,
        provider: selectedProvider,
        model: selectedModel,
        labelIds: selectedLabel ? [selectedLabel] : [],
        dateFrom: getDateFrom(),
        dateTo: getDateTo(),
      });
      await Promise.all([refreshMessages(), refreshConvos()]);
    } catch (err) {
      setSendError(String(err));
      // The backend stores the user message before asking the model, so a
      // refresh picks it up even when the reply failed.
      await refreshMessages();
    } finally {
      setPending(null);
    }
  };

  // A question handed over from the command palette opens a fresh
  // conversation and asks it straight away (or waits for a model to be picked).
  const location = useLocation();
  // Track the handled navigation, not a one-shot flag: the page stays mounted
  // when the palette hands over another question while it is open.
  const handedOffKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prompt = (location.state as { prompt?: string } | null)?.prompt;
    if (!prompt || handedOffKeyRef.current === location.key) return;
    handedOffKeyRef.current = location.key;
    navigate(location.pathname, { replace: true, state: null });
    createConversation().then((conv) => {
      setActiveId(conv.id);
      if (selectedProvider && selectedModel) handleSend(prompt, conv.id);
      else setInput(prompt);
    });
  }, [location.state]);

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
      {showSidebar && (
      <div
        style={{ width: isCompact ? "100%" : sidebarWidth }}
        className="relative flex shrink-0 flex-col border-r bg-background"
      >
        <div className="flex items-center justify-between px-4 h-12 border-b">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNewConversation}
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
            {isCompact && (
              <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(false)} title="Hide conversations" aria-label="Hide conversations">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">No conversations yet.</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors min-w-0 ${
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
                onClick={() => {
                  setActiveId(conv.id);
                  if (isCompact) setSidebarOpen(false);
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                {editingTitleId === conv.id ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => handleTitleSave(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave(conv.id);
                      if (e.key === "Escape") setEditingTitleId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent text-sm border-none outline-none"
                  />
                ) : (
                  <span
                    className="flex-1 min-w-0 truncate text-sm"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setTitleDraft(conv.title);
                      setEditingTitleId(conv.id);
                    }}
                  >
                    {conv.title}
                  </span>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: conv.id, title: conv.title });
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
        {!isCompact && (
          <ResizeHandle
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            min={180}
            max={480}
            side="right"
            label="Resize conversation list"
          />
        )}
      </div>
      )}

      {/* Right panel - chat */}
      {(!isCompact || !sidebarOpen) && (
      <div className="flex flex-1 flex-col">
        {/* Filters bar */}
        <div className="flex items-center gap-3 px-4 h-12 border-b">
          {isCompact && (
            <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(true)} title="Show conversations" aria-label="Show conversations">
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
          <Select
            size="xs"
            value={selectedLabel}
            onChange={(e) => setSelectedLabel(e.target.value)}
            aria-label="Filter by label"
          >
            <option value="">All labels</option>
            {labels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input
            type="date"
            value={dateFromValue}
            onChange={(e) => setDateFromValue(e.target.value)}
            className="h-7 w-auto px-2 text-xs"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateToValue}
            onChange={(e) => setDateToValue(e.target.value)}
            className="h-7 w-auto px-2 text-xs"
            aria-label="To date"
          />
        </div>

        {/* Messages area */}
        {!activeId ? (
          <EmptyState
            icon={MessageSquare}
            title="No conversation selected"
            description="Ask questions across all of your meetings. Answers cite the meetings they came from."
            action={
              <Button size="sm" onClick={handleNewConversation}>
                <Plus /> New conversation
              </Button>
            }
          />
        ) : (
          <>
            <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {dbMessages.length === 0 && !pendingHere && (
                <div className="mx-auto flex h-full w-full max-w-md">
                  <SuggestedPrompts
                    intro="Ask a question across all of your meetings."
                    prompts={LIBRARY_PROMPTS}
                    onPick={(prompt) => handleSend(prompt)}
                    disabled={loading || !selectedProvider || !selectedModel}
                  />
                </div>
              )}
              {dbMessages.map((msg) => {
                const sources = msg.role === "assistant" ? parseSources(msg.sources_json) : [];
                return (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    footer={
                      sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {sources.map((s, i) => (
                            <SourceCitation
                              key={i}
                              source={s}
                              onClick={() => navigate(`/meeting/${s.meeting_id}`)}
                            />
                          ))}
                        </div>
                      )
                    }
                  />
                );
              })}
              {pendingHere && (
                <>
                  <ChatMessage role="user" content={pendingHere.text} />
                  <ChatThinking />
                </>
              )}
              {sendError && (
                <p className="text-xs text-destructive text-center">{sendError}</p>
              )}
              <div ref={sentinelRef} />
            </div>

            {/* Input bar */}
            <div className="border-t p-4">
              {!selectedProvider || !selectedModel ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Choose a model in the sidebar to start chatting. Add API keys in Settings.
                </p>
              ) : (
                <ChatComposer
                  placeholder="Ask about your meetings…"
                  value={input}
                  onChange={setInput}
                  onSend={() => handleSend()}
                  disabled={loading}
                />
              )}
            </div>
          </>
        )}
      </div>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete conversation?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.title}</span>{" "}
            and all of its messages will be permanently deleted.
          </>
        }
        onConfirm={async () => {
          if (deleteTarget) await handleDelete(deleteTarget.id);
        }}
      />
    </div>
  );
}
