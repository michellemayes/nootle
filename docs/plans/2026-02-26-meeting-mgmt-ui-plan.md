# Meeting Management UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add delete (with confirmation), archive, quick-categorize, and card/list view toggle to the meeting library.

**Architecture:** Two small backend additions (update_meeting_category command, include_archived filter on list_meetings), then purely frontend work: a shared action menu (used by both DropdownMenu overflow and Radix ContextMenu), a delete confirmation dialog, an archived filter toggle, a list view, and a view toggle.

**Tech Stack:** Rust/SQLite (Tauri commands), React 19, TypeScript, Radix UI (ContextMenu, DropdownMenu, Dialog), Tailwind CSS, Framer Motion, Lucide icons.

---

### Task 1: Backend — `update_meeting_category` command

**Files:**
- Modify: `src-tauri/src/db.rs` (after line 560, near `update_meeting_status`)
- Modify: `src-tauri/src/commands.rs` (after line 78, near `update_meeting_status`)
- Modify: `src-tauri/src/lib.rs:212` (add to invoke_handler list)

**Step 1: Add DB method**

In `src-tauri/src/db.rs`, after the `update_meeting_status` method (line 560), add:

```rust
pub fn update_meeting_category(&self, id: &str, category_id: Option<&str>) -> Result<()> {
    let conn = self
        .conn
        .lock()
        .map_err(|e| NootleError::Other(format!("Database lock poisoned: {e}")))?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE meetings SET category_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![category_id, now, id],
    )?;

    Ok(())
}
```

**Step 2: Add Tauri command**

In `src-tauri/src/commands.rs`, after `update_meeting_status` (line 78), add:

```rust
#[tauri::command]
pub fn update_meeting_category(
    db: State<'_, DbState>,
    id: String,
    category_id: Option<String>,
) -> Result<(), String> {
    db.update_meeting_category(&id, category_id.as_deref())
        .map_err(|e| e.to_string())
}
```

**Step 3: Register in invoke_handler**

In `src-tauri/src/lib.rs`, add `commands::update_meeting_category,` after line 212 (`commands::update_meeting_status,`).

**Step 4: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

**Step 5: Commit**

```
git add src-tauri/src/db.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add update_meeting_category backend command"
```

---

### Task 2: Backend — filter archived from `list_meetings`

**Files:**
- Modify: `src-tauri/src/db.rs:489-545` (`list_meetings` method)
- Modify: `src-tauri/src/commands.rs:47-54` (`list_meetings` command)

**Step 1: Add `include_archived` param to DB method**

In `src-tauri/src/db.rs`, change the `list_meetings` signature from:

```rust
pub fn list_meetings(&self, category_id: Option<&str>, search: Option<&str>) -> Result<Vec<Meeting>> {
```

to:

```rust
pub fn list_meetings(&self, category_id: Option<&str>, search: Option<&str>, include_archived: bool) -> Result<Vec<Meeting>> {
```

Then after the line `let mut conditions: Vec<String> = Vec::new();` (line 497), add:

```rust
if !include_archived {
    conditions.push("status != 'archived'".to_string());
}
```

**Step 2: Add `include_archived` param to Tauri command**

In `src-tauri/src/commands.rs`, update `list_meetings`:

```rust
#[tauri::command]
pub fn list_meetings(
    db: State<'_, DbState>,
    category_id: Option<String>,
    search: Option<String>,
    include_archived: Option<bool>,
) -> Result<Vec<Meeting>, String> {
    db.list_meetings(category_id.as_deref(), search.as_deref(), include_archived.unwrap_or(false))
        .map_err(|e| e.to_string())
}
```

Note: Using `Option<bool>` with `unwrap_or(false)` so the existing frontend call (which doesn't pass this param) continues to work and defaults to hiding archived.

**Step 3: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

**Step 4: Commit**

```
git add src-tauri/src/db.rs src-tauri/src/commands.rs
git commit -m "feat: filter archived meetings from list_meetings by default"
```

---

### Task 3: Frontend — add TS hooks for archive and update category

**Files:**
- Modify: `src/hooks/useMeetings.ts`

**Step 1: Add `archiveMeeting`, `unarchiveMeeting`, and `updateMeetingCategory` functions**

At the end of `src/hooks/useMeetings.ts` (after `deleteMeeting`), add:

```typescript
export async function archiveMeeting(id: string): Promise<void> {
  await invoke("update_meeting_status", { id, status: "archived" });
}

export async function unarchiveMeeting(id: string): Promise<void> {
  await invoke("update_meeting_status", { id, status: "summarized" });
}

export async function updateMeetingCategory(
  id: string,
  categoryId: string | null,
): Promise<void> {
  await invoke("update_meeting_category", { id, categoryId });
}
```

**Step 2: Update `useMeetings` hook to accept `includeArchived`**

Change the hook signature and invoke call:

```typescript
export function useMeetings(categoryId?: string, search?: string, includeArchived?: boolean) {
```

Update the invoke call inside `refresh`:

```typescript
const result = await invoke<Meeting[]>("list_meetings", {
  categoryId: categoryId ?? null,
  search: search ?? null,
  includeArchived: includeArchived ?? false,
});
```

Add `includeArchived` to the `useCallback` dependency array.

**Step 3: Commit**

```
git add src/hooks/useMeetings.ts
git commit -m "feat: add archive, unarchive, and updateCategory hook functions"
```

---

### Task 4: Frontend — create ContextMenu UI component

**Files:**
- Create: `src/components/ui/context-menu.tsx`

**Step 1: Create the component**

Create `src/components/ui/context-menu.tsx` following the exact pattern of the existing `src/components/ui/dropdown-menu.tsx` but using `ContextMenu` from `radix-ui` instead of `DropdownMenu`. The radix-ui package (v1.4.3) is already installed and includes ContextMenu.

The component should export: `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent`, `ContextMenuSeparator`.

Use the same Tailwind classes as the DropdownMenu equivalents for visual consistency.

**Step 2: Commit**

```
git add src/components/ui/context-menu.tsx
git commit -m "feat: add ContextMenu UI component (Radix)"
```

---

### Task 5: Frontend — create shared MeetingActions menu items component

**Files:**
- Create: `src/components/MeetingActionMenuItems.tsx`

This component renders the shared menu items used by both the overflow DropdownMenu and the right-click ContextMenu. It accepts props to control which Radix primitives to render (dropdown vs context menu).

**Step 1: Create the component**

```tsx
import { Archive, ArchiveRestore, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { Meeting, Category } from "@/types";

interface MeetingActionMenuItemsProps {
  meeting: Meeting;
  categories: Category[];
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onCategorySelect: (categoryId: string | null) => void;
  onNewCategory: () => void;
  // Render props to support both DropdownMenu and ContextMenu primitives
  MenuItem: React.ComponentType<{ children: React.ReactNode; onClick?: () => void; className?: string }>;
  MenuSub: React.ComponentType<{ children: React.ReactNode }>;
  MenuSubTrigger: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  MenuSubContent: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  MenuSeparator: React.ComponentType<{ className?: string }>;
}

export function MeetingActionMenuItems({
  meeting,
  categories,
  onArchive,
  onUnarchive,
  onDelete,
  onCategorySelect,
  onNewCategory,
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
  MenuSeparator,
}: MeetingActionMenuItemsProps) {
  const isArchived = meeting.status === "archived";

  return (
    <>
      {isArchived ? (
        <MenuItem onClick={onUnarchive}>
          <ArchiveRestore className="mr-2 h-4 w-4" />
          Unarchive
        </MenuItem>
      ) : (
        <MenuItem onClick={onArchive}>
          <Archive className="mr-2 h-4 w-4" />
          Archive
        </MenuItem>
      )}
      <MenuSub>
        <MenuSubTrigger>
          <FolderOpen className="mr-2 h-4 w-4" />
          Category
        </MenuSubTrigger>
        <MenuSubContent>
          <MenuItem onClick={() => onCategorySelect(null)}>
            None
          </MenuItem>
          {categories.map((cat) => (
            <MenuItem key={cat.id} onClick={() => onCategorySelect(cat.id)}>
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
              {meeting.category_id === cat.id && (
                <span className="ml-auto text-xs text-muted-foreground">✓</span>
              )}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={onNewCategory}>
            <Plus className="mr-2 h-4 w-4" />
            New category...
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuSeparator />
      <MenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </MenuItem>
    </>
  );
}
```

**Step 2: Commit**

```
git add src/components/MeetingActionMenuItems.tsx
git commit -m "feat: add shared MeetingActionMenuItems component"
```

---

### Task 6: Frontend — create DeleteMeetingDialog component

**Files:**
- Create: `src/components/DeleteMeetingDialog.tsx`

**Step 1: Create the component**

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  onConfirm: () => void;
}

export function DeleteMeetingDialog({
  open,
  onOpenChange,
  meetingTitle,
  onConfirm,
}: DeleteMeetingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete meeting</DialogTitle>
          <DialogDescription>
            Are you sure? This will permanently delete{" "}
            <span className="font-medium text-foreground">{meetingTitle}</span>{" "}
            and all its transcripts, summaries, and insights.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```
git add src/components/DeleteMeetingDialog.tsx
git commit -m "feat: add DeleteMeetingDialog component"
```

---

### Task 7: Frontend — create NewCategoryDialog component

**Files:**
- Create: `src/components/NewCategoryDialog.tsx`

**Step 1: Create the component**

A small dialog with a name input and a row of preset color swatches. Returns the new category on submit.

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface NewCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, color: string) => void;
}

export function NewCategoryDialog({
  open,
  onOpenChange,
  onSubmit,
}: NewCategoryDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), color);
    setName("");
    setColor(PRESET_COLORS[0]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
          <div className="flex gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "white" : "transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```
git add src/components/NewCategoryDialog.tsx
git commit -m "feat: add NewCategoryDialog component"
```

---

### Task 8: Frontend — rewrite MeetingLibrary with all features

This is the main integration task. Rewrite `src/pages/MeetingLibrary.tsx` to include:
- Card/list view toggle (persisted in localStorage)
- Archived filter toggle
- MeetingCard with overflow menu + context menu
- MeetingRow (new, for list view) with overflow menu + context menu
- Delete confirmation dialog
- New category dialog
- Archive/unarchive actions
- Quick-categorize actions

**Files:**
- Modify: `src/pages/MeetingLibrary.tsx`

**Step 1: Rewrite the page**

The full rewrite should:

1. **State**: Add `viewMode` (from localStorage, default "grid"), `showArchived` boolean, `deleteTarget` (Meeting | null for dialog), `newCategoryTarget` (Meeting | null for dialog).

2. **Filter bar**: After the existing category dropdown, add:
   - A "Show archived" toggle button (Archive icon, toggles `showArchived`)
   - A grid/list toggle (LayoutGrid + List icons, toggles `viewMode`, saves to localStorage)

3. **Pass `includeArchived` to `useMeetings`**: `useMeetings(categoryFilter, search || undefined, showArchived)`

4. **MeetingCard**: Wrap in `ContextMenu`. Add three-dot `DropdownMenu` overflow button in the top-right corner (visible on hover). Both menus render `MeetingActionMenuItems`. The overflow button should use `e.stopPropagation()` to prevent navigating to the meeting detail page.

5. **MeetingRow** (new inline component): A horizontal row with title, category color dot + name, date, duration, status badge, and overflow button. Also wrapped in `ContextMenu`. Clicking the row navigates to `/meeting/:id`.

6. **Conditional rendering**: If `viewMode === "grid"`, render the existing grid of cards. If `viewMode === "list"`, render a table-like list of rows.

7. **Dialogs**: Render `DeleteMeetingDialog` and `NewCategoryDialog` at the bottom of the component, controlled by `deleteTarget` and `newCategoryTarget` state.

8. **Action handlers**:
   - `handleDelete`: calls `deleteMeeting(id)`, then `refresh()`
   - `handleArchive`: calls `archiveMeeting(id)`, then `refresh()`
   - `handleUnarchive`: calls `unarchiveMeeting(id)`, then `refresh()`
   - `handleCategorySelect`: calls `updateMeetingCategory(id, categoryId)`, then `refresh()`
   - `handleNewCategory`: calls `createCategory(name, color)`, then `updateMeetingCategory(meetingId, newCategory.id)`, then `refresh()`

**Step 2: Verify it builds**

Run: `pnpm build` (or `pnpm dev` and visually check)
Expected: no TypeScript errors, page renders

**Step 3: Commit**

```
git add src/pages/MeetingLibrary.tsx
git commit -m "feat: meeting library with delete, archive, categorize, and view toggle"
```

---

### Task 9: Verify and polish

**Files:**
- Possibly tweak: `src/pages/MeetingLibrary.tsx`, `src/components/MeetingActionMenuItems.tsx`

**Step 1: Run `pnpm build`**

Ensure no TypeScript errors.

**Step 2: Visual check**

If a dev server is running, check:
- Grid view renders meeting cards with three-dot menu
- List view renders meeting rows
- Right-click opens context menu with Archive, Category submenu, Delete
- Delete opens confirmation dialog
- Archive moves meeting out of view (unless "Show archived" is on)
- Category submenu shows categories and "New category..."
- View toggle persists across page navigation

**Step 3: Final commit if any polish needed**

```
git add -A
git commit -m "fix: polish meeting management UI"
```
