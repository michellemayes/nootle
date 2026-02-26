# Meeting Management UI Design

## Problem

Meeting transcripts cannot be deleted, archived, or recategorized from the UI. The library view only supports a card grid with no list alternative.

## Features

### 1. Context Menu + Overflow Menu

Both MeetingCard (grid view) and MeetingRow (list view) expose actions via:

- **Three-dot overflow button** using the existing DropdownMenu component
- **Right-click context menu** using Radix ContextMenu (new UI component)

Both menus share identical items:

- Archive / Unarchive (toggles based on current status)
- Category > submenu listing existing categories with color dots, plus "New category..."
- Separator
- Delete (destructive red styling)

### 2. Delete Confirmation

Modal dialog using the existing Dialog component:

- Title: "Delete meeting"
- Body: "Are you sure? This will permanently delete the meeting and all its transcripts, summaries, and insights."
- Buttons: Cancel (outline) | Delete (destructive)
- Calls existing `deleteMeeting()` then refreshes the meeting list

### 3. Archive

- `update_meeting_status(id, "archived")` already exists in the backend
- Archived meetings hidden from the default library view
- New "Archived" filter option in the category/filter bar to reveal them
- Archived meetings display a muted "Archived" badge
- Backend change: `list_meetings` excludes `status = 'archived'` by default, accepts `include_archived` boolean param

### 4. Quick Categorize

- Submenu in overflow/context menu lists all categories with color dots
- Selecting a category calls new `update_meeting_category` Rust command
- "New category..." at bottom opens a dialog to name + pick color, creates the category, and assigns it

### 5. Card/List View Toggle

- Two icon buttons (grid / list) in the top-right of the filter bar, next to existing controls
- Persisted in localStorage
- Card view: existing grid layout, unchanged
- List view: compact rows with title, category badge, date, duration, status, and overflow menu

### 6. Backend Changes

- New command: `update_meeting_category(id: String, category_id: Option<String>)` — UPDATE meetings SET category_id WHERE id
- Modified command: `list_meetings` gains `include_archived: bool` parameter, defaults to excluding archived meetings

## Existing Infrastructure

| Piece | Status |
|-------|--------|
| `delete_meeting` Rust command | Exists |
| `deleteMeeting()` TS hook | Exists |
| `update_meeting_status` Rust command | Exists (supports "archived") |
| `update_meeting_category` Rust command | Needs creation |
| Dialog component (Radix) | Exists |
| DropdownMenu component (Radix) | Exists |
| ContextMenu component (Radix) | Needs creation |
| Category CRUD hooks | Exist |
