import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import { FileText, Trash2 } from "lucide-react";

export function TemplatesPage() {
  const { templates, loading, createTemplate, deleteTemplate } = useTemplates();
  const { categories } = useCategories();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newSections, setNewSections] = useState("");
  const [newAutoRules, setNewAutoRules] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createTemplate(
      newName,
      newCategoryId || null,
      newSections,
      newAutoRules,
    );
    setNewName("");
    setNewCategoryId("");
    setNewSections("");
    setNewAutoRules("");
    setDialogOpen(false);
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
            Manage summary templates for different meeting types
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>+ Add Template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Template</DialogTitle>
              <DialogDescription>
                Create a template for structured meeting summaries
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
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>
                Create
              </Button>
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
            Create a template to standardize meeting summaries
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
                        {getCategoryName(template.category_id) && (
                          <Badge variant="secondary">
                            {getCategoryName(template.category_id)}
                          </Badge>
                        )}
                      </div>
                      {template.sections && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          Sections: {template.sections}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteTemplate(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
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
