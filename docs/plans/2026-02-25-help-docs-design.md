# Help & Documentation Page Design

## Goal

Add a dedicated Help page to Nootle with documentation covering getting started, MCP server setup, LLM provider configuration, and troubleshooting. Content stored as markdown files for easy maintenance, rendered in a tabbed UI.

## Architecture

- New `/help` route with tabbed page using existing shadcn Tabs component
- Four markdown files in `src/help/` imported via Vite `?raw` suffix
- `react-markdown` dependency for rendering markdown content
- Thin `Markdown` wrapper component for consistent styling
- Help link added to sidebar navigation
- MCP config stays on Settings page (not removed)

## Content Tabs

### 1. Getting Started
- Required permissions (microphone, screen recording, calendar)
- Making your first recording
- Reviewing transcripts and generating summaries
- Using the chat feature to ask questions about meetings

### 2. MCP Server
- Quick-start card: JSON config snippet with copy button
- What MCP is and why it matters
- Step-by-step setup for Claude Code
- Available tools: `list_meetings`, `get_meeting`, `search_transcripts`
- Resource URIs (`nootle://meetings/{id}/transcript`)
- Example queries to ask Claude once connected

### 3. LLM Providers
- Overview of supported providers (OpenAI, Anthropic, Google, Groq, Ollama)
- Per-provider setup instructions and where to get API keys
- Ollama local setup (no API key needed)
- How to select and switch providers

### 4. Troubleshooting
- Audio not recording (permission checks, restart)
- Transcription issues
- MCP server not connecting
- LLM provider errors

## File Changes

### New files
- `src/pages/Help.tsx` — Tabbed help page component
- `src/components/Markdown.tsx` — Markdown renderer wrapper
- `src/help/getting-started.md`
- `src/help/mcp-server.md`
- `src/help/llm-providers.md`
- `src/help/troubleshooting.md`

### Modified files
- `src/components/Sidebar.tsx` — Add Help nav item
- `src/App.tsx` — Add `/help` route
- `package.json` — Add `react-markdown` dependency

### Unchanged
- `src/pages/Settings.tsx` — MCP config section remains as-is

## New Dependency

`react-markdown` — lightweight markdown renderer (~15KB gzipped)
