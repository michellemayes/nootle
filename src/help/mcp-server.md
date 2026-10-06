Nootle includes a built-in MCP (Model Context Protocol) server that lets AI assistants like Claude access your meeting data directly.

The quick start is filled in for your install, and Settings → About shows it too. After adding it, start a new Claude Code session and "nootle" appears under `/mcp`.

The server is `nootle-cli`, which ships inside Nootle.app and never opens the app window. Setups from older versions that run `nootle --mcp` keep working.

## What is MCP?

MCP (Model Context Protocol) is an open standard that lets AI assistants connect to external tools and data sources. When you enable Nootle's MCP server, Claude can search your meetings, read transcripts, and answer questions about what was discussed — all without you having to copy and paste anything.

## Available Tools

### Meetings

- **list_meetings** — recorded meetings, newest first, with their labels. Filter by title (`search`) or label (`label_id`); archived meetings appear with `include_archived`.
- **get_meeting** — a meeting's details, notes, summaries, labels, scratch notes, Linear tickets, and transcript (`id`)
- **search_transcripts** — full-text search across every transcript (`query`)
- **update_meeting** — change a meeting's title, status, summary template, or notes
- **delete_meeting** — delete a meeting with its recording and everything derived from it
- **export_meeting** — the meeting as Markdown, a plain transcript, or SRT/VTT subtitles
- **rename_speaker** — rename "Speaker 2" to a real name everywhere in a meeting, or merge two speakers
- **edit_transcript_segment** — correct a line of the transcript (`get_meeting` with `include_segment_ids` shows the IDs). With auto-learn on, the fix joins your dictionary.
- **list_labels**, **save_label**, **update_meeting_labels** — organize meetings with labels (`save_label` creates one, or with `id` changes it)
- **add_scratch_note** — timestamped notes on a meeting
- **list_snapshots** — screenshots of shared screens and the text read off them
- **list_dictionary**, **save_dictionary_entry**, **apply_dictionary** — the custom dictionary of names and jargon, and re-applying it to a recorded meeting
- **list_insights** — decisions, action items, and custom insights, across all meetings or one, filtered by type, status, or text
- **update_action_item** — mark an action item done or cancelled, or change its assignee or due date

Results come in pages so they fit in Claude's context: 50 meetings or search matches, or 300 transcript lines, at a time. Claude fetches the next page when it needs more.

Example: Ask Claude *"Find every time someone mentioned the Q3 roadmap across all my meetings."*

### AI features

These send the meeting's transcript to an LLM provider, just like the same buttons in the app. Each takes an optional `provider` and `model`; without them Nootle uses the provider your automatic summaries use.

- **list_llm_models** — the providers and models available, and the default
- **summarize_meeting** — summarize with a template, or with whatever Nootle would run after recording
- **extract_insights** — pull out decisions, action items, and your custom insight types (`replace` redoes them)
- **ask_meeting** — answer a question about one meeting
- **ask_meetings** — answer a question from all your meetings, citing them. It can continue or save a conversation in the Ask view. Needs the search model, downloaded in Nootle's settings.
- **enrich_notes** — merge your notes with details from the transcript
- **analyze_sentiment** — score the meeting's sentiment over time
- **list_recipes**, **create_recipe**, **update_recipe**, **run_recipe** — reusable prompts like `/email`, run on a meeting

### Analytics, search index, and conversations

- **get_meeting_analytics** — talk time, turns, interruptions, engagement, and saved sentiment (computed the first time if needed)
- **get_embedding_status** / **embed_meetings** — how many meetings are indexed for **ask_meetings**, and index the rest (archived meetings are skipped unless indexed one by one)
- **list_conversations**, **get_conversation**, **rename_conversation** — your saved Ask conversations

### Settings

- **get_settings** / **set_setting** — noise reduction, call detection, dictionary auto-learn, and which provider automatic summaries use. Claude can read but not change URL control for recording or snapshots; change those in Nootle.

### Automations

Claude can also set up automations for you: the same integrations, workflows, summary templates, and insight types you manage under Automations and Settings.

- **get_automation_catalog** — the integration types, their credential fields and actions, each action's config fields, and the `{{placeholders}}` text fields accept
- **list_automations** — your integrations, workflows, templates, and insight types
- **create_integration** / **update_integration** — connect Slack, Notion, GitHub, and the rest. Credentials are stored locally and never returned.
- **create_workflow** / **update_workflow** — send a meeting's summary or action items to an integration; enable or disable a workflow
- **run_workflow** — run a workflow on a meeting now
- **list_workflow_runs** — past runs for a meeting
- **create_template** / **update_template** — summary templates, including auto-run
- **create_insight_type** / **update_insight_type** — custom things to extract from every transcript
### Deleting

- **delete_meeting** — a meeting with its recording and everything derived from it
- **delete** — anything else by `kind`: an integration (with its workflows), workflow, template, insight type, recipe, label, dictionary entry, scratch note, snapshot, or conversation

Claude asks before anything that deletes data.

Every input is validated, and errors say what's allowed so Claude can fix its request. If Nootle is open, reopen the page to see changes Claude made.

Example: Ask Claude *"Set up a workflow that opens GitHub issues in acme/app for my action items."*

## Resources

Nootle also exposes meeting transcripts as MCP resources using the URI pattern:

```
nootle://meetings/{id}/transcript
```

This lets Claude fetch raw transcript text for any meeting by its ID.

## Example Queries

Once connected, try asking Claude:

- *"Summarize my last three meetings."*
- *"What did the team decide about the deployment timeline?"*
- *"Search my meetings for discussions about hiring."*
- *"Compare what was discussed in Monday's standup versus Friday's."*
- *"What action items came out of the product review? Mark the deploy one done."*
- *"Rename Speaker 2 in yesterday's standup to Priya and label it Engineering."*
- *"Make a 1:1 template with Wins, Blockers, and Feedback sections and run it on every meeting."*
- *"Connect my Obsidian vault and add a workflow that saves meeting notes to the Meetings folder."*

## Troubleshooting MCP

- **Claude doesn't see Nootle:** Make sure the path in your config points to the actual Nootle binary. If you installed to a non-standard location, update the `command` path.
- **"Server not responding":** Ensure Nootle is installed (the binary must exist on disk). The MCP server runs as a separate process — it doesn't require the Nootle GUI to be open.
- **The Nootle app opens instead of serving MCP:** update Nootle. Current versions serve MCP whenever a client launches them.
- **No meetings returned:** You need to have recorded at least one meeting in Nootle first.
