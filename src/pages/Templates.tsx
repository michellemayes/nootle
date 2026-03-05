import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
import { useRecipes } from "@/hooks/useRecipes";
import { FileText, Pencil, Trash2, Sparkles, Star, ChefHat } from "lucide-react";
import type { Template, Recipe } from "@/types";

export function TemplatesPage() {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const { categories } = useCategories();
  const {
    recipes,
    loading: recipesLoading,
    createRecipe,
    updateRecipe,
    deleteRecipe,
  } = useRecipes();

  // Template form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newSections, setNewSections] = useState("");
  const [newAutoRules, setNewAutoRules] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newFavorite, setNewFavorite] = useState(false);
  const [newAutoRun, setNewAutoRun] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Recipe form state
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeDescription, setRecipeDescription] = useState("");
  const [recipeSlashCommand, setRecipeSlashCommand] = useState("");
  const [recipePromptTemplate, setRecipePromptTemplate] = useState("");
  const [recipeOutputFormat, setRecipeOutputFormat] = useState("markdown");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [slashCommandError, setSlashCommandError] = useState("");

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
        newFavorite,
        newAutoRun,
      );
    } else {
      await createTemplate(newName, newDescription, newCategoryId || null, newSections, newAutoRules, newPrompt, newFavorite, newAutoRun);
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
    setNewFavorite(false);
    setNewAutoRun(false);
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
    setNewFavorite(template.is_favorite);
    setNewAutoRun(template.is_auto_run);
    setDialogOpen(true);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId)?.name ?? null;
  };

  const validateSlashCommand = (value: string): boolean => {
    const valid = /^[a-zA-Z0-9-]+$/.test(value);
    if (!valid && value.length > 0) {
      setSlashCommandError("Only letters, numbers, and hyphens allowed");
    } else {
      setSlashCommandError("");
    }
    return valid || value.length === 0;
  };

  const handleRecipeSubmit = async () => {
    if (!recipeName.trim() || !recipeSlashCommand.trim() || !recipePromptTemplate.trim()) return;
    if (!validateSlashCommand(recipeSlashCommand)) return;

    if (editingRecipe) {
      await updateRecipe(
        editingRecipe.id,
        recipeName,
        recipeDescription,
        recipeSlashCommand,
        recipePromptTemplate,
        recipeOutputFormat,
      );
    } else {
      await createRecipe(
        recipeName,
        recipeDescription,
        recipeSlashCommand,
        recipePromptTemplate,
        recipeOutputFormat,
      );
    }
    resetRecipeForm();
  };

  const resetRecipeForm = () => {
    setRecipeName("");
    setRecipeDescription("");
    setRecipeSlashCommand("");
    setRecipePromptTemplate("");
    setRecipeOutputFormat("markdown");
    setEditingRecipe(null);
    setRecipeDialogOpen(false);
    setSlashCommandError("");
  };

  const startEditingRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setRecipeName(recipe.name);
    setRecipeDescription(recipe.description);
    setRecipeSlashCommand(recipe.slash_command);
    setRecipePromptTemplate(recipe.prompt_template);
    setRecipeOutputFormat(recipe.output_format);
    setRecipeDialogOpen(true);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Tabs defaultValue="templates">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Templates & Recipes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure how meetings are summarized and create slash-command workflows
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
          </TabsList>
        </div>

        <Separator className="mt-4" />

        {/* Templates Tab */}
        <TabsContent value="templates">
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex justify-end">
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
                        : "Define AI instructions for summarizing meetings"}
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
                        Instructions for the AI when summarizing meetings with this template
                      </p>
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
                          <span
                            className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${newFavorite ? "translate-x-4" : "translate-x-0"}`}
                          />
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
                          <span
                            className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${newAutoRun ? "translate-x-4" : "translate-x-0"}`}
                          />
                        </button>
                        Auto-run after recording
                      </label>
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
                        rows={2}
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

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading templates...</p>
            ) : templates.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-medium">No templates found</h2>
                <p className="text-sm text-muted-foreground">
                  Create a template to configure how meetings are summarized
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
                                {template.is_favorite && (
                                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                )}
                                {template.is_auto_run && (
                                  <span
                                    className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded"
                                    title="Auto-run"
                                  >
                                    Auto
                                  </span>
                                )}
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
        </TabsContent>

        {/* Recipes Tab */}
        <TabsContent value="recipes">
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex justify-end">
              <Dialog
                open={recipeDialogOpen}
                onOpenChange={(open) => {
                  if (!open) resetRecipeForm();
                  else setRecipeDialogOpen(true);
                }}
              >
                <DialogTrigger asChild>
                  <Button>+ Add Recipe</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      {editingRecipe ? "Edit Recipe" : "New Recipe"}
                    </DialogTitle>
                    <DialogDescription>
                      {editingRecipe
                        ? "Update this recipe's details"
                        : "Create a reusable AI workflow triggered with a slash command"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Name
                      </label>
                      <Input
                        placeholder="e.g., Write Brief"
                        value={recipeName}
                        onChange={(e) => setRecipeName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Slash Command
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">/</span>
                        <Input
                          placeholder="e.g., brief"
                          value={recipeSlashCommand}
                          onChange={(e) => {
                            setRecipeSlashCommand(e.target.value);
                            validateSlashCommand(e.target.value);
                          }}
                        />
                      </div>
                      {slashCommandError && (
                        <p className="text-xs text-destructive mt-1">
                          {slashCommandError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Description
                      </label>
                      <Input
                        placeholder="e.g., Turn a brainstorm into a structured brief"
                        value={recipeDescription}
                        onChange={(e) => setRecipeDescription(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Prompt Template
                      </label>
                      <textarea
                        placeholder="Use variables: {{transcript}}, {{title}}, {{date}}, {{summary}}"
                        value={recipePromptTemplate}
                        onChange={(e) =>
                          setRecipePromptTemplate(e.target.value)
                        }
                        rows={6}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Available variables: {"{{transcript}}"}, {"{{title}}"},{" "}
                        {"{{date}}"}, {"{{summary}}"}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Output Format
                      </label>
                      <select
                        value={recipeOutputFormat}
                        onChange={(e) =>
                          setRecipeOutputFormat(e.target.value)
                        }
                        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                      >
                        <option value="markdown">Markdown</option>
                        <option value="plain">Plain Text</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetRecipeForm}>
                      Cancel
                    </Button>
                    <MotionButton
                      onClick={handleRecipeSubmit}
                      disabled={
                        !recipeName.trim() ||
                        !recipeSlashCommand.trim() ||
                        !recipePromptTemplate.trim() ||
                        !!slashCommandError
                      }
                    >
                      {editingRecipe ? "Save Changes" : "Create"}
                    </MotionButton>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {recipesLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading recipes...
              </p>
            ) : recipes.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <ChefHat className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-medium">No recipes yet</h2>
                <p className="text-sm text-muted-foreground">
                  Create reusable AI workflows with slash commands
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {recipes.map((recipe) => (
                    <motion.div
                      key={recipe.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        scale: 0.95,
                        transition: { duration: 0.2 },
                      }}
                      layout
                    >
                      <Card>
                        <CardContent>
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{recipe.name}</h3>
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                  /{recipe.slash_command}
                                </code>
                                {recipe.is_builtin && (
                                  <Badge variant="secondary" className="text-xs">
                                    Built-in
                                  </Badge>
                                )}
                              </div>
                              {recipe.description && (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {recipe.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => startEditingRecipe(recipe)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {!recipe.is_builtin && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => deleteRecipe(recipe.id)}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
