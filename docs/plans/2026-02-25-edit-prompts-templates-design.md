# Edit Existing Prompts and Templates

## Problem

Prompts and templates can be created and deleted but not edited. Users must delete and recreate to make changes, losing the original ID and timestamp.

## Design

### Backend (Rust)

**Database (`db.rs`):** Two new functions:
- `update_prompt(id, name, content, is_favorite, is_auto_run)` — SQL UPDATE on prompts table
- `update_template(id, name, category_id, sections, auto_apply_rules)` — SQL UPDATE on templates table

**Commands (`commands.rs`):** Two new Tauri commands:
- `update_prompt` — takes id + all editable fields, returns updated `Prompt`
- `update_template` — takes id + all editable fields, returns updated `Template`

Both follow the existing create command pattern.

### Frontend — Hooks

- `usePrompts.ts`: Add `updatePrompt(id, name, content, isFavorite, isAutoRun)` — invokes command, refreshes list
- `useTemplates.ts`: Add `updateTemplate(id, name, categoryId, sections, autoApplyRules)` — invokes command, refreshes list

### Frontend — UI

**Modal reuse (Prompts.tsx, Templates.tsx):**
- Track `editingPrompt`/`editingTemplate` state (item or null)
- Pre-fill form fields from existing item when editing
- Title: "Edit Prompt"/"Edit Template" vs "Add Prompt"/"Add Template"
- Button: "Save Changes" vs "Create"
- On submit: call update if editing, create if creating
- On close: reset editing state to null

**Card changes:**
- Add pencil icon button next to delete button on each card
- Click sets editing state and opens modal
