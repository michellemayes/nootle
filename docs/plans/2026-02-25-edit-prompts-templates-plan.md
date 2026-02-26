# Edit Prompts & Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the ability to edit existing prompts and templates by reusing the creation modals with pre-filled values.

**Architecture:** Add `update_prompt` and `update_template` DB functions + Tauri commands on the backend, then wire them through the existing hooks and repurpose the creation modals on the frontend.

**Tech Stack:** Rust/SQLite (backend), React/TypeScript (frontend), Tauri invoke bridge

---

### Task 1: Add `update_prompt` to the database layer

**Files:**
- Modify: `src-tauri/src/db.rs:652-657` (after `delete_prompt`, before Templates section)

**Step 1: Add the `update_prompt` method**

Add this method to `impl Database` after `delete_prompt` (line 657) and before the `// --- Templates ---` comment:

```rust
    pub fn update_prompt(
        &self,
        id: &str,
        name: &str,
        content: &str,
        is_favorite: bool,
        is_auto_run: bool,
    ) -> Result<Prompt> {
        let conn = self.conn.lock().unwrap();
        let is_fav = is_favorite as i32;
        let is_auto = is_auto_run as i32;

        conn.execute(
            "UPDATE prompts SET name = ?1, content = ?2, is_favorite = ?3, is_auto_run = ?4 WHERE id = ?5",
            params![name, content, is_fav, is_auto, id],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, content, is_favorite, is_auto_run, created_at
             FROM prompts WHERE id = ?1",
        )?;

        let prompt = stmt
            .query_row(params![id], |row| {
                Ok(Prompt {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    is_favorite: row.get::<_, i32>(3)? != 0,
                    is_auto_run: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    NootleError::Other(format!("Prompt not found: {}", id))
                }
                other => NootleError::Database(other),
            })?;

        Ok(prompt)
    }
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors related to `update_prompt`

---

### Task 2: Add `update_template` to the database layer

**Files:**
- Modify: `src-tauri/src/db.rs:712-716` (after `delete_template`, before Summaries section)

**Step 1: Add the `update_template` method**

Add this method to `impl Database` after `delete_template` (line 716) and before the `// --- Summaries ---` comment:

```rust
    pub fn update_template(
        &self,
        id: &str,
        name: &str,
        category_id: Option<&str>,
        sections: &str,
        auto_apply_rules: &str,
    ) -> Result<Template> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "UPDATE templates SET name = ?1, category_id = ?2, sections = ?3, auto_apply_rules = ?4 WHERE id = ?5",
            params![name, category_id, sections, auto_apply_rules, id],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, category_id, sections, auto_apply_rules, created_at
             FROM templates WHERE id = ?1",
        )?;

        let template = stmt
            .query_row(params![id], |row| {
                Ok(Template {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category_id: row.get(2)?,
                    sections: row.get(3)?,
                    auto_apply_rules: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    NootleError::Other(format!("Template not found: {}", id))
                }
                other => NootleError::Database(other),
            })?;

        Ok(template)
    }
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors related to `update_template`

---

### Task 3: Add Tauri commands for `update_prompt` and `update_template`

**Files:**
- Modify: `src-tauri/src/commands.rs:129-131` (after `delete_prompt`, before template commands)
- Modify: `src-tauri/src/commands.rs:157-159` (after `delete_template`, before summary commands)
- Modify: `src-tauri/src/lib.rs:220` (register new commands in invoke handler)

**Step 1: Add the `update_prompt` command**

Insert after `delete_prompt` command (after line 131) and before `// Template commands`:

```rust
#[tauri::command]
pub fn update_prompt(
    db: State<'_, DbState>,
    id: String,
    name: String,
    content: String,
    is_favorite: bool,
    is_auto_run: bool,
) -> Result<Prompt, String> {
    db.update_prompt(&id, &name, &content, is_favorite, is_auto_run)
        .map_err(|e| e.to_string())
}
```

**Step 2: Add the `update_template` command**

Insert after `delete_template` command (after line 159) and before `// Summary commands`:

```rust
#[tauri::command]
pub fn update_template(
    db: State<'_, DbState>,
    id: String,
    name: String,
    category_id: Option<String>,
    sections: String,
    auto_apply_rules: String,
) -> Result<Template, String> {
    db.update_template(&id, &name, category_id.as_deref(), &sections, &auto_apply_rules)
        .map_err(|e| e.to_string())
}
```

**Step 3: Register both commands in the invoke handler**

In `src-tauri/src/lib.rs`, add after `commands::delete_prompt,` (line 220):

```rust
            commands::update_prompt,
```

And after `commands::delete_template,` (line 223):

```rust
            commands::update_template,
```

**Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: compiles without errors

**Step 5: Commit backend changes**

```bash
git add src-tauri/src/db.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add update_prompt and update_template backend commands"
```

---

### Task 4: Add `updatePrompt` to the `usePrompts` hook

**Files:**
- Modify: `src/hooks/usePrompts.ts`

**Step 1: Add the `updatePrompt` callback**

Add after the `deletePrompt` callback (after line 52) and before the return statement:

```typescript
  const updatePrompt = useCallback(
    async (
      id: string,
      name: string,
      content: string,
      isFavorite: boolean,
      isAutoRun: boolean,
    ) => {
      const prompt = await invoke<Prompt>("update_prompt", {
        id,
        name,
        content,
        isFavorite,
        isAutoRun,
      });
      await refresh();
      return prompt;
    },
    [refresh],
  );
```

**Step 2: Add `updatePrompt` to the return object**

Change the return statement to include `updatePrompt`:

```typescript
  return { prompts, loading, error, refresh, createPrompt, updatePrompt, deletePrompt };
```

---

### Task 5: Add `updateTemplate` to the `useTemplates` hook

**Files:**
- Modify: `src/hooks/useTemplates.ts`

**Step 1: Add the `updateTemplate` callback**

Add after the `deleteTemplate` callback (after line 52) and before the return statement:

```typescript
  const updateTemplate = useCallback(
    async (
      id: string,
      name: string,
      categoryId: string | null,
      sections: string,
      autoApplyRules: string,
    ) => {
      const template = await invoke<Template>("update_template", {
        id,
        name,
        categoryId,
        sections,
        autoApplyRules,
      });
      await refresh();
      return template;
    },
    [refresh],
  );
```

**Step 2: Add `updateTemplate` to the return object**

Change the return statement to include `updateTemplate`:

```typescript
  return { templates, loading, error, refresh, createTemplate, updateTemplate, deleteTemplate };
```

**Step 3: Commit hook changes**

```bash
git add src/hooks/usePrompts.ts src/hooks/useTemplates.ts
git commit -m "feat: add updatePrompt and updateTemplate to hooks"
```

---

### Task 6: Add edit functionality to Prompts page

**Files:**
- Modify: `src/pages/Prompts.tsx`

**Step 1: Add `updatePrompt` to the destructured hook and add editing state**

Change line 19 to also destructure `updatePrompt`:

```typescript
  const { prompts, loading, createPrompt, updatePrompt, deletePrompt } = usePrompts();
```

Add after the existing state declarations (after line 24):

```typescript
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
```

Import the `Prompt` type at the top:

```typescript
import type { Prompt } from "@/types";
```

**Step 2: Update the dialog open handler to support edit mode**

Replace the `handleCreate` function with a `handleSubmit` that handles both create and edit:

```typescript
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
```

**Step 3: Update the Dialog to reset editing state on close**

Change `onOpenChange={setDialogOpen}` to:

```tsx
onOpenChange={(open) => {
  if (!open) resetForm();
  else setDialogOpen(true);
}}
```

**Step 4: Update modal title and button labels**

Change the `DialogTitle` from `"New Prompt"` to:

```tsx
<DialogTitle>{editingPrompt ? "Edit Prompt" : "New Prompt"}</DialogTitle>
```

Change the `DialogDescription` to:

```tsx
<DialogDescription>
  {editingPrompt
    ? "Update this prompt's details"
    : "Create a prompt template for meeting summaries"}
</DialogDescription>
```

Change the submit button from `Create` to:

```tsx
<Button onClick={handleSubmit} disabled={!newName.trim() || !newContent.trim()}>
  {editingPrompt ? "Save Changes" : "Create"}
</Button>
```

Change the Cancel button to call `resetForm`:

```tsx
<Button variant="outline" onClick={resetForm}>
  Cancel
</Button>
```

**Step 5: Add edit button to each prompt card**

In the card actions area, add a pencil edit button before the delete button. Replace the single delete `Button` (lines 159-166) with:

```tsx
<div className="flex items-center gap-1 shrink-0">
  <Button
    variant="ghost"
    size="icon-sm"
    className="text-muted-foreground hover:text-foreground"
    onClick={() => startEditing(prompt)}
    title="Edit"
  >
    {"\u270E"}
  </Button>
  <Button
    variant="ghost"
    size="icon-sm"
    className="text-muted-foreground hover:text-destructive"
    onClick={() => deletePrompt(prompt.id)}
    title="Delete"
  >
    {"\uD83D\uDDD1"}
  </Button>
</div>
```

---

### Task 7: Add edit functionality to Templates page

**Files:**
- Modify: `src/pages/Templates.tsx`

**Step 1: Add `updateTemplate` to the destructured hook and add editing state**

Change line 21 to also destructure `updateTemplate`:

```typescript
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates();
```

Add after the existing state declarations (after line 27):

```typescript
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
```

Import the `Template` type at the top:

```typescript
import type { Template } from "@/types";
```

**Step 2: Replace `handleCreate` with `handleSubmit` and helpers**

```typescript
  const handleSubmit = async () => {
    if (!newName.trim()) return;
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, newName, newCategoryId || null, newSections, newAutoRules);
    } else {
      await createTemplate(newName, newCategoryId || null, newSections, newAutoRules);
    }
    resetForm();
  };

  const resetForm = () => {
    setNewName("");
    setNewCategoryId("");
    setNewSections("");
    setNewAutoRules("");
    setEditingTemplate(null);
    setDialogOpen(false);
  };

  const startEditing = (template: Template) => {
    setEditingTemplate(template);
    setNewName(template.name);
    setNewCategoryId(template.category_id ?? "");
    setNewSections(template.sections);
    setNewAutoRules(template.auto_apply_rules);
    setDialogOpen(true);
  };
```

**Step 3: Update the Dialog to reset editing state on close**

Change `onOpenChange={setDialogOpen}` to:

```tsx
onOpenChange={(open) => {
  if (!open) resetForm();
  else setDialogOpen(true);
}}
```

**Step 4: Update modal title and button labels**

Change the `DialogTitle` to:

```tsx
<DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
```

Change the `DialogDescription` to:

```tsx
<DialogDescription>
  {editingTemplate
    ? "Update this template's details"
    : "Create a template for structured meeting summaries"}
</DialogDescription>
```

Change the submit button:

```tsx
<Button onClick={handleSubmit} disabled={!newName.trim()}>
  {editingTemplate ? "Save Changes" : "Create"}
</Button>
```

Change the Cancel button to call `resetForm`:

```tsx
<Button variant="outline" onClick={resetForm}>
  Cancel
</Button>
```

**Step 5: Add edit button to each template card**

Replace the single delete `Button` (lines 172-179) with:

```tsx
<div className="flex items-center gap-1 shrink-0">
  <Button
    variant="ghost"
    size="icon-sm"
    className="text-muted-foreground hover:text-foreground"
    onClick={() => startEditing(template)}
    title="Edit"
  >
    {"\u270E"}
  </Button>
  <Button
    variant="ghost"
    size="icon-sm"
    className="text-muted-foreground hover:text-destructive"
    onClick={() => deleteTemplate(template.id)}
    title="Delete"
  >
    {"\uD83D\uDDD1"}
  </Button>
</div>
```

**Step 6: Commit frontend changes**

```bash
git add src/pages/Prompts.tsx src/pages/Templates.tsx
git commit -m "feat: add edit buttons and modal reuse for prompts and templates"
```

---

### Task 8: Build and verify

**Step 1: Run full build**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: compiles without errors

**Step 2: Run frontend type check**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Expected: no type errors

**Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build issues"
```
