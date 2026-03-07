# Obsidian Integration Design

## Overview

Add Obsidian as a new integration type in Nootle's workflow system. When triggered, it writes an Obsidian-native markdown file to a user-configured vault directory. No API or credentials required — Obsidian is local-only.

## Integration Setup

- **Integration type:** `obsidian`
- **Vault path:** selected via Tauri's native folder picker dialog
- **Subfolder:** text field for subdirectory within vault (e.g., `Meetings`), auto-created if missing
- **`credentials_json` stores:**
  ```json
  {
    "vault_path": "/Users/michelle/Obsidian/Work",
    "speaker_map": {
      "Speaker 1": "Michelle Mayes",
      "Speaker 2": "Alex Chen"
    }
  }
  ```

## Workflow Action

- **Action type:** `create_note`
- **Config fields:**
  - `subfolder` (required) — target folder within vault
  - `filename_template` (optional) — default: `{{date}} - {{title}}`
  - `note_template` (optional) — custom body template

## Speaker Wikilink Mapping

- Configured per-integration in the Settings UI
- Mapped speakers render as `[[Name]]` wikilinks
- Unmapped speakers render as plain text

## Generated Markdown Format

```markdown
---
date: 2026-03-07
title: Weekly Standup
tags:
  - meeting
  - nootle
speakers:
  - "[[Michelle Mayes]]"
  - "Alex Chen"
---

# Weekly Standup

## Summary
{{summary}}

## Action Items
- [ ] Review PR #42 — assigned to [[Michelle Mayes]]
- [ ] Update docs — assigned to Alex Chen (due: 2026-03-10)

## Key Decisions
- Decided to ship v2 by end of month
```

## Backend Changes

### `workflows.rs`
- Add `"obsidian"` match arm in `execute_workflow`
- New `execute_obsidian` function (~60 lines):
  - Reads vault path from integration credentials
  - Builds YAML frontmatter (date, title, tags, speakers with wikilinks)
  - Renders body using template system with wikilink-replaced speaker names
  - Writes file to `{vault_path}/{subfolder}/{filename}.md` via `tokio::fs`

### File naming
- Default pattern: `2026-03-07 - Weekly Standup.md`
- Sanitize invalid filename characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
- Deduplicate with ` (2)`, ` (3)` suffix if file exists

## Frontend Changes

### `Settings.tsx`
- Add `obsidian` to `INTEGRATION_TYPES` with:
  - Vault path field using Tauri folder picker (`dialog.open`)
  - Speaker mapping UI (add/remove rows of label → name pairs)
- Add `obsidian` to `ACTION_TYPES_BY_INTEGRATION` with `create_note` action:
  - `subfolder` field (required)
  - `filename_template` field (optional)
  - `note_template` field (optional)
