import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useTemplates } from "@/hooks/useTemplates";
import { useCategories } from "@/hooks/useCategories";
import { FileText, Pencil, Trash2, Sparkles } from "lucide-react";
import type { Template } from "@/types";

export function TemplatesPage() {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const { categories } = useCategories();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newSections, setNewSections] = useState("");
  const [newAutoRules, setNewAutoRules] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const handleSubmit = async () => {
    if (!newName.trim()) return;
    if (editingTemplate) {
      await updateTemplate(
        editingTemplate.id,
        newName,
        newDescription,
        newCategoryId || null,
        newSections,
        newAutoRules,
        newPrompt,
      );
    } else {
      await createTemplate(newName, newDescription, newCategoryId || null, newSections, newAutoRules, newPrompt);
    }
    resetForm();
  };

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
    setNewCategoryId("");
    setNewSections("");
    setNewAutoRules("");
    setNewPrompt("");
    setEditingTemplate(null);
    setDialogOpen(false);
  };

  const startEditing = (template: Template) => {
    setEditingTemplate(template);
    setNewName(template.name);
    setNewDescription(template.description);
    setNewCategoryId(template.category_id ?? "");
    setNewSections(template.sections);
    setNewAutoRules(template.auto_apply_rules);
    setNewPrompt(template.prompt);
    setDialogOpen(true);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId)?.name ?? null;
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable section layouts and AI prompts that structure how summaries are organized
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          else setDialogOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button>+ Add Template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
              <DialogDescription>
                {editingTemplate
                  ? "Update this template's details"
                  : "Define the sections, AI prompt, and layout for a type of meeting"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <Input
                  placeholder="e.g., Sprint Planning"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <Input
                  placeholder="e.g., Weekly sprint planning session"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  AI Prompt
                </label>
                <textarea
                  placeholder="e.g., Summarize this meeting transcript. Include key discussion points, decisions made, and action items."
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  This prompt will be used to generate AI summaries for meetings using this template
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Category
                </label>
                <select
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Sections (JSON)
                </label>
                <textarea
                  placeholder='e.g., ["Summary", "Action Items", "Decisions"]'
                  value={newSections}
                  onChange={(e) => setNewSections(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Auto-Apply Rules (JSON)
                </label>
                <textarea
                  placeholder='e.g., {"category": "engineering"}'
                  value={newAutoRules}
                  onChange={(e) => setNewAutoRules(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <MotionButton onClick={handleSubmit} disabled={!newName.trim()}>
                {editingTemplate ? "Save Changes" : "Create"}
              </MotionButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {/* Template list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading templates...</p>
      ) : templates.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">No templates yet</h2>
          <p className="text-sm text-muted-foreground">
            Give Nootle a format to follow
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
          {templates.map((template) => (
            <motion.div
              key={template.id}
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
                        <h3 className="font-medium">{template.name}</h3>
                        {template.is_builtin && (
                          <Badge variant="outline" className="text-xs">
                            Built-in
                          </Badge>
                        )}
                        {getCategoryName(template.category_id) && (
                          <Badge variant="secondary">
                            {getCategoryName(template.category_id)}
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {template.description}
                        </p>
                      )}
                      {template.prompt && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{template.prompt}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(template)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!template.is_builtin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteTemplate(template.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
