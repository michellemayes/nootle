# MCP Server

Nootle includes a built-in MCP (Model Context Protocol) server that lets AI assistants like Claude access your meeting data directly.

## Quick Start

Add this to your Claude Code MCP config (`~/.claude.json` or your project's `.mcp.json`):

```json
{
  "mcpServers": {
    "nootle": {
      "command": "/Applications/Nootle.app/Contents/MacOS/nootle",
      "args": ["--mcp"]
    }
  }
}
```

After saving, restart Claude Code. You should see "nootle" listed as an available MCP server.

## What is MCP?

MCP (Model Context Protocol) is an open standard that lets AI assistants connect to external tools and data sources. When you enable Nootle's MCP server, Claude can search your meetings, read transcripts, and answer questions about what was discussed — all without you having to copy and paste anything.

## Available Tools

### Meetings

- **list_meetings** — list recorded meetings, optionally filtered by title (`search`)
- **get_meeting** — a meeting's details, full transcript, and summaries (`id`)
- **search_transcripts** — full-text search across every transcript (`query`)

Example: Ask Claude *"Find every time someone mentioned the Q3 roadmap across all my meetings."*

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
- **delete_automation** — delete any of the above

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
- *"What action items came out of the product review?"*
- *"Make a 1:1 template with Wins, Blockers, and Feedback sections and run it on every meeting."*
- *"Connect my Obsidian vault and add a workflow that saves meeting notes to the Meetings folder."*

## Troubleshooting MCP

- **Claude doesn't see Nootle:** Make sure the path in your config points to the actual Nootle binary. If you installed to a non-standard location, update the `command` path.
- **"Server not responding":** Ensure Nootle is installed (the binary must exist on disk). The MCP server runs as a separate process — it doesn't require the Nootle GUI to be open.
- **The Nootle app opens when Claude Code starts:** Update Nootle. Older versions opened the full app if `--mcp` didn't reach it, and Claude Code then hung waiting for a server that never answered. Nootle now serves MCP whenever an MCP client launches it, with or without `--mcp`.
- **No meetings returned:** You need to have recorded at least one meeting in Nootle first.
