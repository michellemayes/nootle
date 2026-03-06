import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { ThinkingDots } from "@/components/ThinkingDots";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useChat } from "@/hooks/useChat";
import { useLLM } from "@/hooks/useLLM";
import { useLLMSelection } from "@/hooks/useLLMSelection";
import { useRecipes } from "@/hooks/useRecipes";
import { X, Slash } from "lucide-react";

interface ChatPanelProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ meetingId, open, onClose }: ChatPanelProps) {
  const { messages, loading, error, sendMessage, clearMessages } =
    useChat(meetingId);
  const { models, providers } = useLLM();
  const { selectedProvider, selectedModel, setSelectedModel, changeProvider, filteredModels } = useLLMSelection(providers, models);
  const { recipes, runRecipe } = useRecipes();
  const [input, setInput] = useState("");
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeMessages, setRecipeMessages] = useState<
    { role: string; content: string }[]
  >([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, recipeMessages]);

  const filteredRecipes = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const query = input.slice(1).toLowerCase();
    if (!query) return recipes;
    return recipes.filter((r) =>
      r.slash_command.toLowerCase().startsWith(query),
    );
  }, [input, recipes]);

  useEffect(() => {
    if (input.startsWith("/") && filteredRecipes.length > 0) {
      setShowSlashMenu(true);
      setSelectedSlashIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [input, filteredRecipes.length]);

  const allMessages = [...messages, ...recipeMessages];

  const handleRunRecipe = async (recipeId: string, recipeName: string) => {
    if (!selectedProvider || !selectedModel) return;
    setShowSlashMenu(false);
    setInput("");
    setRecipeLoading(true);

    setRecipeMessages((prev) => [
      ...prev,
      { role: "user", content: `/${recipes.find((r) => r.id === recipeId)?.slash_command || recipeName}` },
    ]);

    try {
      const result = await runRecipe(
        meetingId,
        recipeId,
        selectedProvider,
        selectedModel,
      );
      setRecipeMessages((prev) => [
        ...prev,
        { role: "assistant", content: result },
      ]);
    } catch (err) {
      setRecipeMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${String(err)}` },
      ]);
    } finally {
      setRecipeLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedProvider || !selectedModel) return;
    const msg = input;
    setInput("");
    await sendMessage(msg, selectedProvider, selectedModel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSlashIndex((prev) =>
          prev < filteredRecipes.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSlashIndex((prev) =>
          prev > 0 ? prev - 1 : filteredRecipes.length - 1,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const recipe = filteredRecipes[selectedSlashIndex];
        if (recipe) {
          handleRunRecipe(recipe.id, recipe.name);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const recipe = filteredRecipes[selectedSlashIndex];
        if (recipe) {
          setInput(`/${recipe.slash_command}`);
        }
        return;
      }
    } else {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleClear = () => {
    clearMessages();
    setRecipeMessages([]);
  };


  const isLoading = loading || recipeLoading;

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
              onChange={(e) => changeProvider(e.target.value)}
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
              {allMessages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Go ahead, quiz Nootle about this meeting
                </p>
              )}
              {allMessages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
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

          <div className="relative">
            <AnimatePresence>
              {showSlashMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-3 right-3 mb-1 max-h-52 overflow-y-auto rounded-lg border bg-popover shadow-lg"
                >
                  {filteredRecipes.map((recipe, i) => (
                    <button
                      key={recipe.id}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                        i === selectedSlashIndex ? "bg-accent" : ""
                      }`}
                      onMouseEnter={() => setSelectedSlashIndex(i)}
                      onClick={() => handleRunRecipe(recipe.id, recipe.name)}
                    >
                      <Slash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">/{recipe.slash_command}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {recipe.name}
                          </span>
                        </div>
                        {recipe.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {recipe.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2 p-3">
              <Input
                ref={inputRef}
                placeholder="Ask about this meeting... (type / for recipes)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="flex-1"
              />
              <MotionButton
                size="sm"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
              >
                Ask
              </MotionButton>
            </div>
          </div>

          {/* Clear button */}
          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              size="xs"
              className="w-full text-muted-foreground"
              onClick={handleClear}
            >
              Clear conversation
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
