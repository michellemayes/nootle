import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
} from "@/components/ui/dialog";
import { useTemplates } from "@/hooks/useTemplates";

import { useRecipes } from "@/hooks/useRecipes";
import { FileText, Pencil, Plus, Trash2, Sparkles, Star, SquareSlash } from "lucide-react";
import type { Template, Recipe } from "@/types";
import { WorkflowsManager } from "@/components/WorkflowsManager";

export function TemplatesPage() {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates();

  const {
    recipes,
    loading: recipesLoading,
    createRecipe,
    updateRecipe,
    deleteRecipe,
  } = useRecipes();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [newSections, setNewSections] = useState("");
  const [newAutoRules, setNewAutoRules] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newFavorite, setNewFavorite] = useState(false);
  const [newAutoRun, setNewAutoRun] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeDescription, setRecipeDescription] = useState("");
  const [recipeSlashCommand, setRecipeSlashCommand] = useState("");
  const [recipePromptTemplate, setRecipePromptTemplate] = useState("");
  const [recipeOutputFormat, setRecipeOutputFormat] = useState("markdown");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [slashCommandError, setSlashCommandError] = useState("");
  const [activeTab, setActiveTab] = useState("templates");
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<Template | null>(null);
  const [deleteRecipeTarget, setDeleteRecipeTarget] = useState<Recipe | null>(null);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);

  const handleSubmit = async () => {
    if (!newName.trim()) return;
    if (editingTemplate) {
      await updateTemplate(
        editingTemplate.id,
        newName,
        newDescription,
        newSections,
        newAutoRules,
        newPrompt,
        newFavorite,
        newAutoRun,
      );
    } else {
      await createTemplate(newName, newDescription, newSections, newAutoRules, newPrompt, newFavorite, newAutoRun);
    }
    resetForm();
  };

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
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
    setNewSections(template.sections);
    setNewAutoRules(template.auto_apply_rules);
    setNewPrompt(template.prompt);
    setNewFavorite(template.is_favorite);
    setNewAutoRun(template.is_auto_run);
    setDialogOpen(true);
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
    <div className="flex flex-1 flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col gap-0 overflow-hidden">
        <PageHeader
          title="Automations"
          description="Summary templates, slash commands, and post-meeting workflows"
          tabs={
            <>
              <TabsList>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="recipes">Slash commands</TabsTrigger>
                <TabsTrigger value="post-meeting">Workflows</TabsTrigger>
              </TabsList>
              {activeTab === "templates" && (
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus /> New template
                </Button>
              )}
              {activeTab === "recipes" && (
                <Button size="sm" variant="outline" onClick={() => setRecipeDialogOpen(true)}>
                  <Plus /> New slash command
                </Button>
              )}
              {activeTab === "post-meeting" && (
                <Button size="sm" variant="outline" onClick={() => setWorkflowDialogOpen(true)}>
                  <Plus /> New workflow
                </Button>
              )}
            </>
          }
        />

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          else setDialogOpen(true);
        }}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingTemplate ? "Edit template" : "New template"}</DialogTitle>
                    <DialogDescription>
                      {editingTemplate
                        ? "Update how this template summarizes meetings."
                        : "Define how the AI should summarize meetings."}
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
                        AI prompt
                      </label>
                      <Textarea
                        placeholder="e.g., Summarize this meeting transcript. Include key discussion points, decisions made, and action items."
                        value={newPrompt}
                        onChange={(e) => setNewPrompt(e.target.value)}
                        rows={3}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Instructions for the AI when summarizing meetings with this template.
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Switch
                          checked={newFavorite}
                          onCheckedChange={setNewFavorite}
                        />
                        Favorite
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Switch
                          checked={newAutoRun}
                          onCheckedChange={setNewAutoRun}
                        />
                        Auto-run after recording
                      </label>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Sections (JSON)
                      </label>
                      <Textarea
                        placeholder='e.g., ["Summary", "Action Items", "Decisions"]'
                        value={newSections}
                        onChange={(e) => setNewSections(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Auto-apply rules (JSON)
                      </label>
                      <Textarea
                        placeholder='e.g., {"category": "engineering"}'
                        value={newAutoRules}
                        onChange={(e) => setNewAutoRules(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!newName.trim()}>
                      {editingTemplate ? "Save" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            <Dialog
              open={recipeDialogOpen}
              onOpenChange={(open) => {
                if (!open) resetRecipeForm();
                else setRecipeDialogOpen(true);
              }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {editingRecipe ? "Edit slash command" : "New slash command"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingRecipe
                      ? "Update this slash command's prompt and output."
                      : "A reusable AI prompt you can run from meeting chat by typing /."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Name</label>
                    <Input
                      placeholder="e.g., Write brief"
                      value={recipeName}
                      onChange={(e) => setRecipeName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Slash command</label>
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
                      <p className="text-xs text-destructive mt-1">{slashCommandError}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Description</label>
                    <Input
                      placeholder="e.g., Turn a brainstorm into a structured brief"
                      value={recipeDescription}
                      onChange={(e) => setRecipeDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Prompt template</label>
                    <Textarea
                      placeholder="Use variables: {{transcript}}, {{title}}, {{date}}, {{summary}}"
                      value={recipePromptTemplate}
                      onChange={(e) => setRecipePromptTemplate(e.target.value)}
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Available variables: {"{{transcript}}"}, {"{{title}}"},{" "}
                      {"{{date}}"}, {"{{summary}}"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Output format</label>
                    <Select
                      containerClassName="w-full"
                      value={recipeOutputFormat}
                      onChange={(e) => setRecipeOutputFormat(e.target.value)}
                    >
                      <option value="markdown">Markdown</option>
                      <option value="plain">Plain text</option>
                      <option value="json">JSON</option>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={resetRecipeForm}>Cancel</Button>
                  <Button
                    onClick={handleRecipeSubmit}
                    disabled={
                      !recipeName.trim() ||
                      !recipeSlashCommand.trim() ||
                      !recipePromptTemplate.trim() ||
                      !!slashCommandError
                    }
                  >
                    {editingRecipe ? "Save" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

        <TabsContent value="templates" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-6 p-6">
            {loading ? (
              <LoadingState message={LOADING_COPY.templates} layout="inline" />
            ) : templates.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No templates yet"
                description="Templates control how meetings are summarized."
                action={
                  <Button size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus /> New template
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                    <div key={template.id}>
                      <Card className="h-full">
                        <CardContent>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium leading-snug">{template.name}</h3>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => startEditing(template)}
                                  title="Edit"
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {!template.is_builtin && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteTemplateTarget(template)}
                                    title="Delete"
                                    aria-label="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {template.is_favorite && (
                                <Star
                                  className="h-3.5 w-3.5 fill-highlight text-highlight"
                                  aria-label="Favorite"
                                />
                              )}
                              {template.is_auto_run && (
                                <Badge variant="secondary" size="sm">
                                  Auto-run
                                </Badge>
                              )}
                              {template.is_builtin && (
                                <Badge variant="outline" size="sm">
                                  Built-in
                                </Badge>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {template.description}
                              </p>
                            )}
                            {template.prompt && (
                              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span className="line-clamp-2">{template.prompt}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="recipes" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-6 p-6">
            {recipesLoading ? (
              <LoadingState message={LOADING_COPY.slashCommands} layout="inline" />
            ) : recipes.length === 0 ? (
              <EmptyState
                icon={SquareSlash}
                title="No slash commands yet"
                description="Slash commands are reusable prompts you can run from meeting chat."
                action={
                  <Button size="sm" onClick={() => setRecipeDialogOpen(true)}>
                    <Plus /> New slash command
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recipes.map((recipe) => (
                    <div key={recipe.id}>
                      <Card className="h-full">
                        <CardContent>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium leading-snug">{recipe.name}</h3>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => startEditingRecipe(recipe)}
                                  title="Edit"
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {!recipe.is_builtin && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteRecipeTarget(recipe)}
                                    title="Delete"
                                    aria-label="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                /{recipe.slash_command}
                              </code>
                              {recipe.is_builtin && (
                                <Badge variant="outline" size="sm">
                                  Built-in
                                </Badge>
                              )}
                            </div>
                            {recipe.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {recipe.description}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="post-meeting" className="mt-0 flex-1 overflow-auto">
          <div className="p-6">
            <WorkflowsManager
              creating={workflowDialogOpen}
              onCreatingChange={setWorkflowDialogOpen}
            />
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteTemplateTarget !== null}
        onOpenChange={(open) => !open && setDeleteTemplateTarget(null)}
        title="Delete template?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTemplateTarget?.name}</span>{" "}
            will be permanently deleted. Summaries already created with it are kept.
          </>
        }
        onConfirm={async () => {
          if (deleteTemplateTarget) await deleteTemplate(deleteTemplateTarget.id);
        }}
      />

      <ConfirmDialog
        open={deleteRecipeTarget !== null}
        onOpenChange={(open) => !open && setDeleteRecipeTarget(null)}
        title="Delete slash command?"
        description={
          <>
            <span className="font-medium text-foreground">/{deleteRecipeTarget?.slash_command}</span>{" "}
            will be permanently deleted.
          </>
        }
        onConfirm={async () => {
          if (deleteRecipeTarget) await deleteRecipe(deleteRecipeTarget.id);
        }}
      />
    </div>
  );
}
