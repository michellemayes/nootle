import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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

export function PromptsPage() {
  const { prompts, loading, createPrompt, deletePrompt } = usePrompts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newFavorite, setNewFavorite] = useState(false);
  const [newAutoRun, setNewAutoRun] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) return;
    await createPrompt(newName, newContent, newFavorite, newAutoRun);
    setNewName("");
    setNewContent("");
    setNewFavorite(false);
    setNewAutoRun(false);
    setDialogOpen(false);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prompts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage prompts for meeting summarization
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>+ Add Prompt</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Prompt</DialogTitle>
              <DialogDescription>
                Create a prompt template for meeting summaries
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
                  Content
                </label>
                <textarea
                  placeholder="Write your prompt template..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newFavorite}
                    onChange={(e) => setNewFavorite(e.target.checked)}
                    className="rounded"
                  />
                  Favorite
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newAutoRun}
                    onChange={(e) => setNewAutoRun(e.target.checked)}
                    className="rounded"
                  />
                  Auto-run
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || !newContent.trim()}>
                Create
              </Button>
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
          <span className="text-4xl">{"\u2728"}</span>
          <h2 className="text-lg font-medium">No prompts yet</h2>
          <p className="text-sm text-muted-foreground">
            Create a prompt to get started with summarization
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map((prompt) => (
            <motion.div
              key={prompt.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{prompt.name}</h3>
                        {prompt.is_favorite && (
                          <span className="text-amber-400 text-sm" title="Favorite">
                            {"\u2605"}
                          </span>
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
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deletePrompt(prompt.id)}
                    >
                      {"\uD83D\uDDD1"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
