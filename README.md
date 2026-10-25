<p align="center">
  <img src="docs/icon.png" width="128" height="128" alt="Nootle icon" />
</p>

<h1 align="center">Nootle</h1>

<p align="center">
  <strong>The open-source, local-first AI meeting notetaker for Mac</strong>
  <br />
  Record any call without a bot, transcribe it on your Mac, and get summaries, action items, and answers with the AI you choose. A free, MIT-licensed alternative to Granola, Otter, and Fireflies.
</p>

<p align="center">
  <code>brew tap michellemayes/nootle https://github.com/michellemayes/nootle && brew install --cask nootle</code>
</p>

<p align="center">
  <a href="https://github.com/michellemayes/nootle/releases"><img src="https://img.shields.io/github/v/release/michellemayes/nootle?style=flat-square&color=72937A" alt="Release" /></a>
  <a href="https://github.com/michellemayes/nootle/actions"><img src="https://img.shields.io/github/actions/workflow/status/michellemayes/nootle/ci.yml?style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://github.com/michellemayes/nootle/blob/main/LICENSE"><img src="https://img.shields.io/github/license/michellemayes/nootle?style=flat-square&color=D9B78B" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%2014%2B%20(Apple%20Silicon%20M1%E2%80%93M5)-CC765B?style=flat-square" alt="macOS 14+ (Apple Silicon M1–M5)" />
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Nootle demo: start a recording, watch the live transcript build while Live Assist answers a question from your documents, stop to get a summary, then ask across all your meetings" width="960" />
</p>

Nootle records your meetings (microphone and system audio), transcribes them on your Mac with speaker names, and lets you ask an AI about what was said. Point it at your project folders and it answers from those too, even live during a call.

**Private by default.** Recording and transcription happen on your Mac, and audio is never uploaded. Summaries and chat use the AI you pick: a local Ollama model keeps everything on-device, or bring an OpenAI, Anthropic, Google, Groq, OpenRouter or Bedrock key, or your Claude or ChatGPT subscription through the Claude Code or Codex CLI. **Local-only mode** (Settings → Privacy) allows only local models. There's no telemetry. Nootle only goes online for things you set up, plus model downloads and update checks.

## Features

- **No bot in the call.** Records mic and system audio from Zoom, Meet, Teams, or anything else, and can pop up when a call starts.
- **Live transcript with speakers.** Transcribed on your Mac with Parakeet, or Underdog Bark 3.0 Plus: a 210 MB English model that's as accurate (better on meetings). Speakers are told apart and named from the call's video tiles. Nootle can also learn voices and recognize them in later meetings.
- **Summaries and action items.** Every meeting is summarized when it ends, with templates you choose. Decisions and action items are collected across meetings.
- **Commitment tracker.** Follows what people promised across meetings: what's still owed, what slipped, and the moment a later meeting showed it done.
- **Pre-meeting brief.** A few minutes before a calendar meeting: who's coming, open action items, last time's decisions, and related docs (opt-in).
- **Menu bar mode.** Record, pause, jot a note and see what's next from the menu bar, with or without a Dock icon.
- **Live Assist.** During a call, answers questions from your documents and past meetings, including ones it hears asked aloud.
- **Ask the Room.** Listen to a meeting as a short spoken recap, each point in the voice of whoever raised it, made on your Mac. Then type a question and hear the answer in their voice.
- **Ask your meetings and docs.** Chat across every meeting and your knowledge base (PDF, Word, PowerPoint, Excel, web pages and more), with citations.
- **Meeting Coach (opt-in).** A private card after each call on how you showed up (talk share, interruptions, questions, filler words, pace), with trends over time.
- **Your notes, expanded.** Jot shorthand while recording, and highlight the moments that matter in one click (⌘⇧H). Nootle fills your notes out from the transcript afterwards, and summaries give your highlights extra attention.
- **Snapshots.** Captures shared slides and screens into your notes, and reads the text on them. Summaries cite slides as clickable thumbnails, and a slide recap says what was said while each was up.
- **Workflows.** Send recaps and action items to Slack, Notion, Linear, GitHub, Asana, Confluence, Obsidian, or email.
- **Share links.** End-to-end encrypted `nootle.ai` links to a meeting's notes.
- **AI connector.** Claude, ChatGPT and other cloud AI apps connect to `nootle.ai/mcp` and read the shared meetings you pick. Each person signs in with their own key, so it works for Claude Team workspaces too.
- **Continue in Claude.** One click opens a meeting in Claude, ChatGPT, Codex, Perplexity, or any app that takes a prompt in a link, with your own icon if you like.
- **Built for agents.** A CLI and an MCP server (with a read-only mode) give Claude Code and other agents your meetings, and let them pin notes to a meeting's timeline.
- **Plain files you own.** Export any meeting, or all of them, as Markdown, text, SRT or WebVTT. Import recordings and transcripts from Otter, Fathom, Granola, Zoom, Teams and Meet.

See [every feature in detail](docs/features.md).

## Why Nootle

| | Nootle | Granola | Otter | Meetily |
|---|---|---|---|---|
| Records without a bot joining the call | ✅ | ✅ | Desktop app only | ✅ |
| Transcription on your Mac | ✅ | ❌ | ❌ | ✅ |
| Tells speakers apart, remembers names | ✅ free | "Me / Them" on desktop | ✅ | Pro |
| Any AI, including local models (Ollama) or your Claude / ChatGPT subscription | ✅ | ❌ | ❌ | ✅ |
| Full history as plain files you own | ✅ | Limited free history; encrypted local cache | Paid plans | ✅ |
| Answers from your own docs, live in the call (local knowledge base) | ✅ | ❌ | ❌ | ❌ |
| MCP server and CLI for agents | ✅ (read-only mode available) | MCP on paid plans | MCP (enterprise) | — |
| Open source | ✅ MIT | ❌ | ❌ | Open core |
| Price | Free | Free / $14 a month | Free / from $8.33 a month | Free / about $10 a month |

Competitor details are as of October 2026 and change often; check their sites.


## Install

```bash
brew tap michellemayes/nootle https://github.com/michellemayes/nootle
brew install --cask nootle
```

Or download the latest `.dmg` from [Releases](https://github.com/michellemayes/nootle/releases). Nootle needs an Apple Silicon Mac (M1–M5) on macOS 14 or later. It updates itself from inside the app.

On first launch it asks for **Microphone**, **Screen Recording** (for system audio and Snapshots), and optionally **Calendar** (to name recordings after events).

> On v0.1.15 or earlier, in-app updates fail. Download the latest `.dmg` and drag it over the old app once.

## CLI and MCP server

`nootle-cli` ships inside the app. Add Nootle to Claude Code as an MCP server:

```bash
claude mcp add --scope user nootle -- /Applications/Nootle.app/Contents/MacOS/nootle-cli mcp
```

Add `--read-only` to the end to stop agents editing or sending anything. The [CLI, MCP and URL scheme guide](docs/cli.md) covers every command.

### Cloud AI connector

Claude on the web, ChatGPT and other cloud AI apps can't run `nootle-cli`, so nootle.ai hosts a read-only MCP server for meetings you've shared. Add `https://nootle.ai/mcp` as a custom connector (in Claude: Settings → Connectors → Add custom connector). When it asks you to sign in, paste the key from Nootle's Settings → Integrations → **AI connector** (click **Create connector key** the first time). On a Claude Team or Enterprise plan an owner adds the connector once and each member signs in with their own key, reaching only their own meetings. It lists only the shares you tick **Let AI connectors read this** on in the Share menu, with the tools `list_shared_meetings`, `get_shared_meeting`, `search_shared_meetings` and `read_share_link`.

Sign-in is standard MCP OAuth (discovery, dynamic client registration, PKCE). nootle.ai has no accounts and keeps no sign-in state: client ids, codes and tokens are sealed with a server secret (`OAUTH_SECRET`, or one derived from the Blob token), and the tokens carry your key. Shares stay encrypted on nootle.ai. Your key opens its list of shares (and that list holds each share's key), so nootle.ai decrypts them in memory only while answering your AI, and never stores a key. Clients without OAuth can send the key itself as `Authorization: Bearer <key>`, and old `nootle.ai/mcp/<key>` links keep working. **Reset key** signs every AI app out; **Turn off** removes the connector.

## Development

```bash
pnpm install
pnpm tauri dev
```

[docs/development.md](docs/development.md) covers tests, releases, and how integration sign-in works.

## License

[MIT](LICENSE)

Models are downloaded when you pick them, not bundled, and Settings → Models shows what each takes on disk, deletes the ones you don't use, and cleans up unfinished downloads, audio from deleted meetings, and old logs. [Underdog Bark 3.0 Plus](https://huggingface.co/ConwayResearch/Underdog-Bark-3.0-Plus) is by Conway Research under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), derived from NVIDIA's [Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) and Moondream's [parakeet-ultra](https://huggingface.co/moondream/parakeet-ultra).
