# Help & Documentation Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a tabbed Help page to Nootle with markdown-based documentation covering getting started, MCP server setup, LLM providers, and troubleshooting.

**Architecture:** A new `/help` route renders a `HelpPage` component that uses the existing shadcn Tabs to display four markdown files. Markdown is rendered with `react-markdown` via a thin `Markdown` wrapper. The sidebar gains a Help nav item. Settings page keeps its MCP config as-is.

**Tech Stack:** React 19, react-markdown, shadcn Tabs, Vite `?raw` imports, Tailwind CSS

---

### Task 1: Install react-markdown dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `cd /Users/michelle/conductor/workspaces/nootle/melbourne && pnpm add react-markdown`

**Step 2: Verify installation**

Run: `pnpm ls react-markdown`
Expected: `react-markdown` version listed

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(help): add react-markdown dependency"
```

---

### Task 2: Create Markdown renderer component

**Files:**
- Create: `src/components/Markdown.tsx`

**Step 1: Create the component**

```tsx
import ReactMarkdown from "react-markdown";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:text-sm [&_li]:text-muted-foreground [&_li]:mb-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_hr]:my-4 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
```

Note: We use Tailwind utility classes with descendant selectors rather than adding `@tailwindcss/typography` to keep dependencies minimal. The prose styling targets the dark theme colors already defined in the app.

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/melbourne && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to Markdown.tsx

**Step 3: Commit**

```bash
git add src/components/Markdown.tsx
git commit -m "feat(help): add Markdown renderer component"
```

---

### Task 3: Write Getting Started markdown content

**Files:**
- Create: `src/help/getting-started.md`

**Step 1: Create the markdown file**

```markdown
# Getting Started

Welcome to Nootle — your local AI meeting recorder and assistant. This guide walks you through recording your first meeting.

## Permissions

Nootle needs three macOS permissions to work properly:

- **Microphone** — captures your voice and other participants via speakers. Grant when prompted or go to System Settings → Privacy & Security → Microphone.
- **Screen Recording** — required for system audio capture (hearing what others say in virtual meetings). Go to System Settings → Privacy & Security → Screen Recording.
- **Calendar** — optional, lets Nootle detect upcoming meetings and auto-label recordings. Go to System Settings → Privacy & Security → Calendars.

After changing permissions you may need to restart Nootle for them to take effect.

## Your First Recording

1. Click **New Recording** in the sidebar.
2. Nootle begins capturing your microphone and (if permitted) system audio.
3. A live transcript appears as you speak — you'll see text populate in real time with speaker labels.
4. When the meeting ends, click **Stop Recording**.

The recording is saved locally and appears in your **Meetings** library.

## Reviewing a Meeting

Open any meeting from the library to see:

- **Transcript** — the full text with speaker labels and timestamps. Click any segment to jump to that point.
- **Summary** — click **Generate Summary** to create an AI-powered summary using your configured LLM provider. You can customize the summary style under **Prompts**.
- **Chat** — ask follow-up questions about the meeting. For example: "What action items were discussed?" or "Summarize what Alice said about the budget."

## Customizing Prompts and Templates

- **Prompts** (sidebar → Prompts) — edit the instructions Nootle sends to the LLM when generating summaries or answering chat questions.
- **Templates** (sidebar → Templates) — create reusable summary formats for different meeting types (standup, 1:1, all-hands, etc).
```

**Step 2: Commit**

```bash
git add src/help/getting-started.md
git commit -m "feat(help): add getting started documentation"
```

---

### Task 4: Write MCP Server markdown content

**Files:**
- Create: `src/help/mcp-server.md`

**Step 1: Create the markdown file**

```markdown
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
```

**Step 2: Commit**

```bash
git add src/help/mcp-server.md
git commit -m "feat(help): add MCP server documentation"
```

---

### Task 5: Write LLM Providers markdown content

**Files:**
- Create: `src/help/llm-providers.md`

**Step 1: Create the markdown file**

```markdown
# LLM Providers

Nootle uses large language models to generate meeting summaries and power the chat feature. You can choose from several providers.

## Supported Providers

| Provider | API Key Required | Notes |
|----------|-----------------|-------|
| **OpenAI** | Yes | GPT-4o and other models. Get a key at [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | Yes | Claude models. Get a key at [console.anthropic.com](https://console.anthropic.com) |
| **Google** | Yes | Gemini models. Get a key at [aistudio.google.com](https://aistudio.google.com) |
| **Groq** | Yes | Fast inference. Get a key at [console.groq.com](https://console.groq.com) |
| **Ollama** | No | Run models locally. Install from [ollama.com](https://ollama.com) |

## Setting Up a Provider

1. Go to **Settings** in the sidebar.
2. Find the provider you want under **API Keys**.
3. Click **Add Key** and paste your API key.
4. The key is stored securely in your macOS Keychain — it never leaves your machine.

Once at least one provider is configured, Nootle will use it for summaries and chat.

## Using Ollama (Local, No API Key)

Ollama lets you run LLMs entirely on your Mac with no API key and no data leaving your machine.

1. Install Ollama from [ollama.com](https://ollama.com).
2. Pull a model: `ollama pull llama3.2`
3. Make sure Ollama is running (it starts a local server on port 11434).
4. Nootle auto-detects Ollama — no API key needed.

## Switching Providers

Nootle uses whichever provider has a configured API key. If you have multiple keys saved, Nootle picks the first available one. To switch, remove the key for the provider you don't want to use.
```

**Step 2: Commit**

```bash
git add src/help/llm-providers.md
git commit -m "feat(help): add LLM providers documentation"
```

---

### Task 6: Write Troubleshooting markdown content

**Files:**
- Create: `src/help/troubleshooting.md`

**Step 1: Create the markdown file**

```markdown
# Troubleshooting

Common issues and how to fix them.

## Audio Not Recording

**Microphone not captured:**
- Open System Settings → Privacy & Security → Microphone and confirm Nootle is allowed.
- If you just granted the permission, restart Nootle.
- Try a quick test recording to confirm audio is working.

**System audio not captured:**
- System audio requires Screen Recording permission. Go to System Settings → Privacy & Security → Screen Recording and enable Nootle.
- Restart Nootle after granting this permission.
- Note: System audio capture uses macOS CoreAudio and works with most virtual meeting apps (Zoom, Teams, Google Meet, etc).

## Transcription Issues

**No transcript appearing:**
- Make sure audio is actually being recorded (you should see an active waveform during recording).
- Transcription runs locally via the Parakeet model. On first launch, the model may take a moment to load.
- If the transcript is empty after stopping, check that your microphone is picking up sound (try a different mic if available).

**Inaccurate transcription:**
- Transcription quality depends on audio clarity. Reduce background noise when possible.
- Speaker identification works best with 2-4 distinct speakers.

## LLM Provider Errors

**"No LLM provider configured":**
- Go to Settings and add an API key for at least one provider, or install Ollama.

**Summary generation fails:**
- Verify your API key is valid and has available credits/quota.
- Check that you have internet connectivity (not needed for Ollama).
- Try a different provider to isolate whether the issue is provider-specific.

## MCP Server Issues

See the **MCP Server** tab for detailed MCP troubleshooting.

## General

**App won't start:**
- Make sure you're running macOS 14 or later.
- Try deleting the app preferences: `~/Library/Application Support/Nootle/` and relaunching.

**Data location:**
- Database: `~/Library/Application Support/Nootle/nootle.db`
- Audio files are stored alongside the database.
```

**Step 2: Commit**

```bash
git add src/help/troubleshooting.md
git commit -m "feat(help): add troubleshooting documentation"
```

---

### Task 7: Create Help page component

**Files:**
- Create: `src/pages/Help.tsx`

**Step 1: Add the Vite raw import type declaration**

Check if `src/vite-env.d.ts` exists. If it does, add the `?raw` module declaration to it. If not, create it.

Add this declaration (either to existing file or new one):

```typescript
/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}
```

**Step 2: Create Help.tsx**

```tsx
import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";

import gettingStartedMd from "@/help/getting-started.md?raw";
import mcpServerMd from "@/help/mcp-server.md?raw";
import llmProvidersMd from "@/help/llm-providers.md?raw";
import troubleshootingMd from "@/help/troubleshooting.md?raw";

const MCP_CONFIG = `{
  "mcpServers": {
    "nootle": {
      "command": "/Applications/Nootle.app/Contents/MacOS/nootle",
      "args": ["--mcp"]
    }
  }
}`;

function McpQuickStart() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="rounded-lg border bg-card p-4 mb-6">
      <h3 className="text-sm font-medium mb-2">Quick Start — MCP Config</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Add this to your Claude Code config to connect Nootle:
      </p>
      <div className="relative">
        <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
          {MCP_CONFIG}
        </pre>
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-2 right-2 text-xs"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

const tabs = [
  { value: "getting-started", label: "Getting Started", content: gettingStartedMd },
  { value: "mcp-server", label: "MCP Server", content: mcpServerMd, quickStart: true },
  { value: "llm-providers", label: "LLM Providers", content: llmProvidersMd },
  { value: "troubleshooting", label: "Troubleshooting", content: troubleshootingMd },
] as const;

export function HelpPage() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Learn how to use Nootle and get the most out of your meetings
        </p>
      </div>

      <Tabs defaultValue="getting-started" className="flex-1 flex flex-col overflow-hidden">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="overflow-hidden">
            <ScrollArea className="h-full">
              <div className="pr-4 pb-8">
                {"quickStart" in tab && tab.quickStart && <McpQuickStart />}
                <Markdown content={tab.content} />
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/melbourne && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/pages/Help.tsx src/vite-env.d.ts
git commit -m "feat(help): create tabbed Help page component"
```

---

### Task 8: Wire up routing and sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx:6-11`
- Modify: `src/App.tsx:10-11` and `:58-85`

**Step 1: Add Help to sidebar nav items**

In `src/components/Sidebar.tsx`, add the Help item to `navItems` array after Settings:

```typescript
const navItems = [
  { to: "/", label: "Meetings", icon: "🎤" },
  { to: "/templates", label: "Templates", icon: "📄" },
  { to: "/prompts", label: "Prompts", icon: "✨" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
  { to: "/help", label: "Help", icon: "❓" },
];
```

**Step 2: Add the Help route to App.tsx**

Add the import at the top of `src/App.tsx`:

```typescript
import { HelpPage } from "@/pages/Help";
```

Add the route inside the `<Routes>` block (after the settings route):

```tsx
<Route
  path="/help"
  element={
    <Layout>
      <HelpPage />
    </Layout>
  }
/>
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/melbourne && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Verify the app builds**

Run: `cd /Users/michelle/conductor/workspaces/nootle/melbourne && pnpm build 2>&1 | tail -10`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat(help): wire up Help page route and sidebar nav"
```

---

### Task 9: Final verification

**Step 1: Full build check**

Run: `cd /Users/michelle/conductor/workspaces/nootle/melbourne && pnpm build`
Expected: Clean build with no errors

**Step 2: Verify all files are committed**

Run: `git status`
Expected: Working tree clean

**Step 3: Review the diff from main**

Run: `git log main..HEAD --oneline`
Expected: 7 commits covering dependency, component, markdown files, page, and routing
