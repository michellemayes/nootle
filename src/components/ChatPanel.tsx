import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { ThinkingDots } from "@/components/ThinkingDots";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useChat } from "@/hooks/useChat";
import { useLLM } from "@/hooks/useLLM";
import { X } from "lucide-react";

interface ChatPanelProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ meetingId, open, onClose }: ChatPanelProps) {
  const { messages, loading, error, sendMessage, clearMessages } =
    useChat(meetingId);
  const { models, providers } = useLLM();
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default to first provider/model when loaded
  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (selectedProvider && models.length > 0 && !selectedModel) {
      const providerModels = models.filter(
        (m) => m.provider === selectedProvider,
      );
      if (providerModels.length > 0) {
        setSelectedModel(providerModels[0].id);
      }
    }
  }, [selectedProvider, models, selectedModel]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !selectedProvider || !selectedModel) return;
    const msg = input;
    setInput("");
    await sendMessage(msg, selectedProvider, selectedModel);
  };

  const filteredModels = models.filter(
    (m) => m.provider === selectedProvider,
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l bg-background shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold">Ask Nootle</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Provider/Model selector */}
          <div className="flex items-center gap-2 px-4 py-2 border-b">
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setSelectedModel("");
              }}
              className="h-7 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Provider</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-7 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Model</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="flex flex-col gap-3 p-4">
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Go ahead, quiz Nootle about this meeting
                </p>
              )}
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <ThinkingDots />
                  </div>
                </div>
              )}
              {error && (
                <p className="text-xs text-destructive text-center">{error}</p>
              )}
            </div>
          </ScrollArea>

          <Separator />

          {/* Input */}
          <div className="flex items-center gap-2 p-3">
            <Input
              placeholder="Ask about this meeting..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
              className="flex-1"
            />
            <MotionButton size="sm" onClick={handleSend} disabled={loading || !input.trim()}>
              Ask
            </MotionButton>
          </div>

          {/* Clear button */}
          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              size="xs"
              className="w-full text-muted-foreground"
              onClick={clearMessages}
            >
              Clear conversation
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
