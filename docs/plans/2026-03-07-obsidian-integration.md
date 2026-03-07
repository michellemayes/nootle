# Obsidian Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Obsidian as a workflow integration that exports meeting notes as Obsidian-native markdown files to a local vault.

**Architecture:** Extends the existing integration/workflow system. Backend adds an `execute_obsidian` function in `workflows.rs` that writes markdown files with YAML frontmatter and wikilinks. Frontend adds Obsidian to the integration types in Settings with a folder picker for vault path and speaker mapping UI.

**Tech Stack:** Rust (tokio::fs for file I/O), Tauri dialog plugin (folder picker), React/TypeScript (Settings UI)

---

### Task 1: Backend — `execute_obsidian` function

**Files:**
- Modify: `src-tauri/src/workflows.rs`

**Step 1: Add the `execute_obsidian` function and wire it into the match arm**

Add `"obsidian"` to the match in `execute_workflow` (line 29) and add the new function at the end of the file (before the closing `}`). The function:
- Reads `vault_path` and `speaker_map` from integration credentials
- Reads `subfolder`, `filename_template`, `note_template` from workflow config
- Builds YAML frontmatter with date, title, tags, speakers (mapped speakers as `[[Name]]`)
- Renders body using `render_template` with speaker names replaced by wikilinks in action items
- Sanitizes filename, deduplicates if file exists
- Creates subfolder if needed, writes `.md` file via `tokio::fs`

```rust
// In execute_workflow match block, add before the `other` arm:
        "obsidian" => execute_obsidian(workflow, integration, context).await,
```

```rust
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

async fn execute_obsidian(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let vault_path = creds["vault_path"]
        .as_str()
        .ok_or("Missing vault_path in Obsidian credentials")?;
    let speaker_map: std::collections::HashMap<String, String> = creds
        .get("speaker_map")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let subfolder = config["subfolder"]
        .as_str()
        .ok_or("Missing subfolder in workflow config")?;
    let filename_template = config["filename_template"]
        .as_str()
        .unwrap_or("{{date}} - {{title}}");

    // Build filename
    let date_str = context.meeting_date.split('T').next().unwrap_or(&context.meeting_date);
    let filename_raw = filename_template
        .replace("{{date}}", date_str)
        .replace("{{title}}", &context.meeting_title);
    let filename = sanitize_filename(&filename_raw);

    // Build output directory
    let dir = std::path::PathBuf::from(vault_path).join(subfolder);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create directory {}: {e}", dir.display()))?;

    // Deduplicate filename
    let mut file_path = dir.join(format!("{filename}.md"));
    let mut counter = 2u32;
    while file_path.exists() {
        file_path = dir.join(format!("{filename} ({counter}).md"));
        counter += 1;
    }

    // Map speakers to display names, wikilink mapped ones
    let speakers_yaml: Vec<String> = {
        let mut seen = std::collections::HashSet::new();
        context
            .action_items
            .iter()
            .filter_map(|ai| ai.assignee.as_deref())
            .chain(std::iter::once(""))  // placeholder to ensure we process
            .filter(|s| !s.is_empty() && seen.insert(s.to_string()))
            .map(|name| {
                if let Some(mapped) = speaker_map.get(name) {
                    format!("  - \"[[{mapped}]]\"")
                } else {
                    format!("  - \"{}\"", name)
                }
            })
            .collect()
    };

    // Apply wikilinks to summary and action items text
    let apply_wikilinks = |text: &str| -> String {
        let mut result = text.to_string();
        for (label, name) in &speaker_map {
            result = result.replace(label, &format!("[[{name}]]"));
        }
        result
    };

    let summary_text = context
        .summary
        .as_deref()
        .unwrap_or("No summary available");
    let summary_with_links = apply_wikilinks(summary_text);

    // Build action items as task checkboxes
    let action_items_text: String = context
        .action_items
        .iter()
        .map(|ai| {
            let assignee_display = ai.assignee.as_deref().map(|name| {
                if let Some(mapped) = speaker_map.get(name) {
                    format!(" — assigned to [[{mapped}]]")
                } else {
                    format!(" — assigned to {name}")
                }
            }).unwrap_or_default();
            let due = ai.due_date.as_deref()
                .map(|d| format!(" (due: {d})"))
                .unwrap_or_default();
            format!("- [ ] {}{}{}", ai.content, assignee_display, due)
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Check for custom note template
    let note_template = config["note_template"].as_str();

    let body = if let Some(tmpl) = note_template {
        render_template(tmpl, context)
    } else {
        format!(
            "# {title}\n\n## Summary\n{summary}\n\n## Action Items\n{actions}",
            title = context.meeting_title,
            summary = summary_with_links,
            actions = action_items_text,
        )
    };

    // Build frontmatter
    let speakers_section = if speakers_yaml.is_empty() {
        String::new()
    } else {
        format!("speakers:\n{}\n", speakers_yaml.join("\n"))
    };

    let content = format!(
        "---\ndate: {date}\ntitle: \"{title}\"\ntags:\n  - meeting\n  - nootle\n{speakers}---\n\n{body}",
        date = date_str,
        title = context.meeting_title.replace('"', "\\\""),
        speakers = speakers_section,
        body = body,
    );

    tokio::fs::write(&file_path, &content)
        .await
        .map_err(|e| format!("Failed to write file {}: {e}", file_path.display()))?;

    Ok(WorkflowResult {
        message: format!("Note created: {}", file_path.file_name().unwrap_or_default().to_string_lossy()),
        output: Some(file_path.display().to_string()),
    })
}
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors

**Step 3: Commit**

```bash
git add src-tauri/src/workflows.rs
git commit -m "feat: add Obsidian workflow execution backend"
```

---

### Task 2: Backend — Unit tests for Obsidian helpers

**Files:**
- Modify: `src-tauri/src/workflows.rs` (add `#[cfg(test)]` module at bottom)

**Step 1: Write tests for `sanitize_filename`**

Add at the end of `workflows.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename_basic() {
        assert_eq!(sanitize_filename("My Meeting"), "My Meeting");
    }

    #[test]
    fn test_sanitize_filename_strips_invalid_chars() {
        assert_eq!(sanitize_filename("Q1: Review / Planning"), "Q1_ Review _ Planning");
    }

    #[test]
    fn test_sanitize_filename_all_special() {
        assert_eq!(sanitize_filename("a\\b:c*d?e\"f<g>h|i"), "a_b_c_d_e_f_g_h_i");
    }
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test -- --test-threads=1 2>&1 | tail -10`
Expected: 3 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/workflows.rs
git commit -m "test: add sanitize_filename unit tests"
```

---

### Task 3: Frontend — Add Obsidian to integration types

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add Obsidian to `INTEGRATION_TYPES` and `ACTION_TYPES_BY_INTEGRATION`**

In `INTEGRATION_TYPES` array (after the `email` entry, before `] as const`), add:

```typescript
  { type: "obsidian", name: "Obsidian", fields: [{ key: "vault_path", label: "Vault Path", placeholder: "/path/to/vault" }] },
```

In `ACTION_TYPES_BY_INTEGRATION` (after `email` entry, before `};`), add:

```typescript
  obsidian: [{ value: "create_note", label: "Create Note", configFields: [
    { key: "subfolder", label: "Subfolder", placeholder: "Meetings", required: true },
    { key: "filename_template", label: "Filename Template", placeholder: "{{date}} - {{title}}", required: false },
    { key: "note_template", label: "Note Template", placeholder: "Optional custom template", required: false },
  ] }],
```

In `PROVIDER_DISPLAY_NAMES` add:

```typescript
  obsidian: "Obsidian",
```

**Step 2: Verify the build**

Run: `cd /Users/michelle/conductor/workspaces/nootle/kingston-v1 && pnpm build 2>&1 | tail -5`
Expected: build succeeds (or `tsc` passes)

**Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add Obsidian to integration and workflow types"
```

---

### Task 4: Frontend — Folder picker for vault path

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add folder picker behavior for Obsidian integration**

The `IntegrationCard` component currently renders all fields as password inputs. For Obsidian's `vault_path` field, replace the password input with a button that opens Tauri's native folder dialog.

At the top of Settings.tsx, add the import:

```typescript
import { open } from "@tauri-apps/plugin-dialog";
```

In the `IntegrationCard` component, inside the field rendering loop (the `{intType.fields.map((field) => (` block), wrap the existing `<Input>` in a conditional:

```typescript
{intType.fields.map((field) => (
  <div key={field.key} className="flex items-center gap-2">
    <label className="text-xs text-muted-foreground w-24 shrink-0">{field.label}</label>
    {field.key === "vault_path" ? (
      <div className="flex gap-2 flex-1">
        <Input
          readOnly
          placeholder={field.placeholder}
          value={fields[field.key] ?? ""}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const selected = await open({ directory: true, title: "Select Obsidian Vault" });
            if (selected) {
              setFields((prev) => ({ ...prev, [field.key]: selected as string }));
            }
          }}
        >
          Browse
        </Button>
      </div>
    ) : (
      <Input
        type="password"
        placeholder={field.placeholder}
        value={fields[field.key] ?? ""}
        onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
        className="flex-1"
      />
    )}
  </div>
))}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/kingston-v1 && npx tsc --noEmit 2>&1 | tail -5`
Expected: no errors

**Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add folder picker for Obsidian vault path"
```

---

### Task 5: Frontend — Speaker mapping UI

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add speaker mapping rows to the Obsidian integration card**

After the vault_path field loop in `IntegrationCard`, add a speaker mapping section that only shows for `obsidian` type. This goes inside the `expanded && !isConnected` block, after the fields map:

```typescript
{intType.type === "obsidian" && (
  <div className="space-y-2 pt-2">
    <label className="text-xs text-muted-foreground font-medium">Speaker Mapping</label>
    <p className="text-[11px] text-muted-foreground">Map transcript speaker labels to names. Mapped names become [[wikilinks]] in Obsidian.</p>
    {(fields._speakerMapKeys ?? "").split(",").filter(Boolean).map((key, i) => (
      <div key={i} className="flex items-center gap-2">
        <Input
          placeholder="Speaker 1"
          value={key}
          onChange={(e) => {
            const keys = (fields._speakerMapKeys ?? "").split(",").filter(Boolean);
            keys[i] = e.target.value;
            setFields((prev) => ({ ...prev, _speakerMapKeys: keys.join(",") }));
          }}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          placeholder="Person Name"
          value={(fields[`_speakerMap_${i}`] ?? "")}
          onChange={(e) => setFields((prev) => ({ ...prev, [`_speakerMap_${i}`]: e.target.value }))}
          className="flex-1"
        />
        <Button variant="ghost" size="sm" onClick={() => {
          const keys = (fields._speakerMapKeys ?? "").split(",").filter(Boolean);
          keys.splice(i, 1);
          setFields((prev) => {
            const next = { ...prev, _speakerMapKeys: keys.join(",") };
            delete next[`_speakerMap_${i}`];
            return next;
          });
        }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    ))}
    <Button variant="outline" size="sm" onClick={() => {
      const keys = (fields._speakerMapKeys ?? "").split(",").filter(Boolean);
      keys.push("");
      setFields((prev) => ({ ...prev, _speakerMapKeys: keys.join(",") }));
    }}>
      <Plus className="h-3.5 w-3.5 mr-1" /> Add Speaker
    </Button>
  </div>
)}
```

Then modify `handleConnect` to build the `speaker_map` from the temporary fields before calling `onConnect`. For the obsidian type, transform the fields:

```typescript
// Inside handleConnect, before the onConnect call, add for obsidian:
if (intType.type === "obsidian") {
  const speakerMap: Record<string, string> = {};
  const keys = (fields._speakerMapKeys ?? "").split(",").filter(Boolean);
  keys.forEach((key, i) => {
    const value = fields[`_speakerMap_${i}`]?.trim();
    if (key.trim() && value) {
      speakerMap[key.trim()] = value;
    }
  });
  const creds: Record<string, string> = {
    vault_path: fields.vault_path ?? "",
    speaker_map: JSON.stringify(speakerMap),
  };
  setSaving(true);
  try {
    await onConnect("obsidian", "Obsidian", creds);
    setFields({});
    setExpanded(false);
  } finally {
    setSaving(false);
  }
  return;
}
```

Note: The `onConnect` handler in the parent serializes creds to JSON. The backend will receive `credentials_json` containing `{"vault_path": "...", "speaker_map": "{...}"}`. The `execute_obsidian` function should handle `speaker_map` as either an object or a JSON string. Update the backend parsing accordingly — use `serde_json::from_str` if the value is a string, or `serde_json::from_value` if it's already an object.

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/kingston-v1 && npx tsc --noEmit 2>&1 | tail -5`
Expected: no errors

**Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add speaker mapping UI for Obsidian integration"
```

---

### Task 6: Backend — Handle speaker_map as string or object

**Files:**
- Modify: `src-tauri/src/workflows.rs`

**Step 1: Update speaker_map parsing in `execute_obsidian`**

Replace the `speaker_map` parsing block:

```rust
    let speaker_map: std::collections::HashMap<String, String> = match creds.get("speaker_map") {
        Some(serde_json::Value::Object(obj)) => {
            serde_json::from_value(serde_json::Value::Object(obj.clone())).unwrap_or_default()
        }
        Some(serde_json::Value::String(s)) => {
            serde_json::from_str(s).unwrap_or_default()
        }
        _ => std::collections::HashMap::new(),
    };
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors

**Step 3: Commit**

```bash
git add src-tauri/src/workflows.rs
git commit -m "fix: handle speaker_map as string or object in Obsidian integration"
```

---

### Task 7: Integration test — End-to-end file write

**Files:**
- Modify: `src-tauri/src/workflows.rs` (add to `#[cfg(test)]` module)

**Step 1: Write an async test that calls `execute_obsidian` and verifies the file**

```rust
    #[tokio::test]
    async fn test_execute_obsidian_creates_file() {
        let tmp = tempfile::tempdir().unwrap();
        let vault_path = tmp.path().to_str().unwrap();

        let integration = crate::db::Integration {
            id: "int-1".to_string(),
            integration_type: "obsidian".to_string(),
            name: "Obsidian".to_string(),
            credentials_json: serde_json::json!({
                "vault_path": vault_path,
                "speaker_map": { "Speaker 1": "Michelle Mayes" }
            }).to_string(),
            created_at: "2026-03-07".to_string(),
        };

        let workflow = crate::db::Workflow {
            id: "wf-1".to_string(),
            name: "Export to Obsidian".to_string(),
            description: None,
            icon: None,
            integration_id: "int-1".to_string(),
            action_type: "create_note".to_string(),
            config_json: serde_json::json!({
                "subfolder": "Meetings"
            }).to_string(),
            is_enabled: true,
            created_at: "2026-03-07".to_string(),
        };

        let context = WorkflowContext {
            meeting_title: "Weekly Standup".to_string(),
            meeting_date: "2026-03-07T10:00:00".to_string(),
            summary: Some("Discussed Q1 roadmap. Speaker 1 will lead the effort.".to_string()),
            action_items: vec![
                ActionItemContext {
                    content: "Review PR #42".to_string(),
                    assignee: Some("Speaker 1".to_string()),
                    due_date: Some("2026-03-10".to_string()),
                },
            ],
        };

        let result = execute_obsidian(&workflow, &integration, &context).await.unwrap();
        assert!(result.message.contains("Note created"));

        let file_path = tmp.path().join("Meetings").join("2026-03-07 - Weekly Standup.md");
        assert!(file_path.exists(), "File should exist at {:?}", file_path);

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("date: 2026-03-07"));
        assert!(content.contains("title: \"Weekly Standup\""));
        assert!(content.contains("[[Michelle Mayes]]"));
        assert!(content.contains("- [ ] Review PR #42"));
        assert!(content.contains("(due: 2026-03-10)"));
    }

    #[tokio::test]
    async fn test_execute_obsidian_deduplicates_filename() {
        let tmp = tempfile::tempdir().unwrap();
        let vault_path = tmp.path().to_str().unwrap();
        let meetings_dir = tmp.path().join("Meetings");
        std::fs::create_dir_all(&meetings_dir).unwrap();
        std::fs::write(meetings_dir.join("2026-03-07 - Standup.md"), "existing").unwrap();

        let integration = crate::db::Integration {
            id: "int-1".to_string(),
            integration_type: "obsidian".to_string(),
            name: "Obsidian".to_string(),
            credentials_json: serde_json::json!({ "vault_path": vault_path }).to_string(),
            created_at: "2026-03-07".to_string(),
        };

        let workflow = crate::db::Workflow {
            id: "wf-1".to_string(),
            name: "Export".to_string(),
            description: None,
            icon: None,
            integration_id: "int-1".to_string(),
            action_type: "create_note".to_string(),
            config_json: serde_json::json!({ "subfolder": "Meetings" }).to_string(),
            is_enabled: true,
            created_at: "2026-03-07".to_string(),
        };

        let context = WorkflowContext {
            meeting_title: "Standup".to_string(),
            meeting_date: "2026-03-07".to_string(),
            summary: Some("Summary".to_string()),
            action_items: vec![],
        };

        let result = execute_obsidian(&workflow, &integration, &context).await.unwrap();
        assert!(result.output.unwrap().contains("(2)"));
    }
```

**Step 2: Run the tests**

Run: `cd src-tauri && cargo test obsidian -- --test-threads=1 2>&1 | tail -10`
Expected: 2 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/workflows.rs
git commit -m "test: add integration tests for Obsidian workflow execution"
```
