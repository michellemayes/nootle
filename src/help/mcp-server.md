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

Once connected, Claude has access to three tools:

### list_meetings

Lists all your recorded meetings. Supports optional filtering.

- **category_id** (optional) — filter by meeting category
- **search** (optional) — search meetings by title

Example: Ask Claude *"What meetings did I record this week?"*

### get_meeting

Retrieves full details for a single meeting, including the complete transcript and any generated summaries.

- **id** (required) — the meeting ID

Example: Ask Claude *"Show me the transcript from my last standup."*

### search_transcripts

Full-text search across all your meeting transcripts. Returns matching segments with speaker labels and timestamps.

- **query** (required) — the text to search for

Example: Ask Claude *"Find every time someone mentioned the Q3 roadmap across all my meetings."*

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

## Troubleshooting MCP

- **Claude doesn't see Nootle:** Make sure the path in your config points to the actual Nootle binary. If you installed to a non-standard location, update the `command` path.
- **"Server not responding":** Ensure Nootle is installed (the binary must exist on disk). The MCP server runs as a separate process — it doesn't require the Nootle GUI to be open.
- **No meetings returned:** You need to have recorded at least one meeting in Nootle first.
