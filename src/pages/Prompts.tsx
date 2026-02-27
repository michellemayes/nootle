import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePrompts } from "@/hooks/usePrompts";
import { Pencil, Sparkles, Star, Trash2 } from "lucide-react";
import type { Prompt } from "@/types";

export function PromptsPage() {
  const { prompts, loading, createPrompt, updatePrompt, deletePrompt } = usePrompts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newFavorite, setNewFavorite] = useState(false);
  const [newAutoRun, setNewAutoRun] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  const handleSubmit = async () => {
    if (!newName.trim() || !newContent.trim()) return;
    if (editingPrompt) {
      await updatePrompt(editingPrompt.id, newName, newContent, newFavorite, newAutoRun);
    } else {
      await createPrompt(newName, newContent, newFavorite, newAutoRun);
    }
    resetForm();
  };

  const resetForm = () => {
    setNewName("");
    setNewContent("");
    setNewFavorite(false);
    setNewAutoRun(false);
    setEditingPrompt(null);
    setDialogOpen(false);
  };

  const startEditing = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setNewName(prompt.name);
    setNewContent(prompt.content);
    setNewFavorite(prompt.is_favorite);
    setNewAutoRun(prompt.is_auto_run);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prompts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Instructions that tell the AI what to focus on and how to write
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          else setDialogOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button>+ Add Prompt</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPrompt ? "Edit Prompt" : "New Prompt"}</DialogTitle>
              <DialogDescription>
                {editingPrompt
                  ? "Update this prompt's details"
                  : "Write instructions for the AI \u2014 what to extract, how detailed to be, what tone to use"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <Input
                  placeholder="e.g., Action Items"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Instructions
                </label>
                <textarea
                  placeholder="e.g., Focus on action items and decisions. Use bullet points. Keep it under 500 words."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newFavorite}
                    onClick={() => setNewFavorite(!newFavorite)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${newFavorite ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${newFavorite ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  Favorite
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newAutoRun}
                    onClick={() => setNewAutoRun(!newAutoRun)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${newAutoRun ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${newAutoRun ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  Auto-run after recording
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <MotionButton onClick={handleSubmit} disabled={!newName.trim() || !newContent.trim()}>
                {editingPrompt ? "Save Changes" : "Create"}
              </MotionButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {/* Prompt list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading prompts...</p>
      ) : prompts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">No prompts yet</h2>
          <p className="text-sm text-muted-foreground">
            Teach Nootle what to listen for
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
          {prompts.map((prompt) => (
            <motion.div
              key={prompt.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              layout
            >
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{prompt.name}</h3>
                        {prompt.is_favorite && (
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        )}
                        {prompt.is_auto_run && (
                          <span
                            className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded"
                            title="Auto-run"
                          >
                            Auto
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {prompt.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(prompt)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deletePrompt(prompt.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
