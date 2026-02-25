# Nootle: Meeting Recorder App Design

A lightweight, fast meeting recorder for macOS built with Tauri 2.x and Rust. Captures system audio and mic, transcribes locally with Parakeet v3 via CoreML, identifies speakers, auto-summarizes with user-chosen LLM providers, and exposes all data via a bundled MCP server.

## Architecture

Monolithic Tauri 2.x application. Single binary, single process. Rust backend handles audio capture, transcription, diarization, storage, LLM calls, and MCP serving. React/TypeScript frontend renders in Tauri's webview.

```
Nootle (Tauri 2.x)
├── React + TypeScript Frontend
│   ├── Meeting Library
│   ├── Transcript Viewer
│   ├── AI Chat Panel
│   └── Settings
│   (shadcn/ui + Tailwind + Framer Motion)
│
├── Tauri IPC
│
└── Rust Backend
    ├── Audio Capture (Core Audio Process Tap via cidre)
    ├── Parakeet v3 CoreML Transcription
    ├── Speaker Diarization (pyannote-rs)
    ├── Meeting Manager (SQLite via rusqlite)
    ├── Meeting Detector (sysinfo crate, process monitoring)
    ├── Calendar Connector (EventKit via objc2 FFI)
    ├── LLM Integration (OpenAI, Anthropic, Google, Groq, Ollama)
    └── MCP Server (stdio-based, bundled)
```

## Audio Pipeline

1. Create Core Audio Process Tap (global mono, excluding Nootle) via `cidre` crate for system audio capture. Requires Screen Recording permission.
2. Capture mic input via `cpal` default input device.
3. Mix both streams in a ring buffer with RMS-based ducking (reduce system audio when mic speech detected).
4. Write mixed audio to lossless WAV for archival.
5. Feed audio through VAD filter; only speech segments proceed.
6. Parallel processing:
   - Transcription: Parakeet v3 CoreML (text + timestamps)
   - Diarization: `pyannote-rs` (speaker labels + time segments)
7. Align transcription timestamps with diarization labels to produce attributed transcript.

### Transcription

Parakeet v3 converted to CoreML using the FluidAudio approach (native CoreML conversion, not ONNX Runtime's CoreML EP). Expected ~110x real-time on Apple Silicon. Model downloaded on first launch (~650MB).

Three-stage inference: mel-spectrogram preprocessor, FastConformer encoder, TDT decoder. Tokens stream to frontend in real-time via Tauri events.

### Speaker Diarization

`pyannote-rs` crate: pure Rust, uses segmentation-3.0 + WeSpeaker ONNX models with CoreML execution provider on macOS. Processes audio in sliding 10-second windows. 1 hour of audio in under 1 minute.

## Meeting Detection

### Process Monitoring

Poll running processes every 5 seconds via `sysinfo` crate. Detect `zoom.us`, `Microsoft Teams`, Chrome with Meet windows. On detection, trigger macOS notification: "Meeting detected in Zoom -- Start recording?" Clicking brings Nootle to foreground with one-click Record.

### Calendar Integration

Read macOS Calendar events via EventKit framework (`objc2` FFI). macOS Calendar syncs Google Calendar, Outlook, and iCloud automatically -- no direct API integration needed. Show notification 2 minutes before scheduled meetings. Auto-populate meeting title and category from calendar event.

### Notifications

macOS `UNUserNotificationCenter` for rich, actionable notifications with "Record" and "Dismiss" buttons. Configurable per-app and per-calendar in settings.

## Data Model

SQLite database via `rusqlite`. FTS5 full-text search on transcripts and summaries.

### Tables

**meetings**: id, title, start_time, end_time, category_id, audio_path, status (recording|transcribing|summarized|archived), calendar_event_id, created_at, updated_at

**transcripts**: id, meeting_id, speaker_label, text, start_ms, end_ms, confidence

**summaries**: id, meeting_id, prompt_id, provider, model, content, created_at

**categories**: id, name, color (hex), icon (emoji or icon name)

**templates**: id, name, category_id, sections (JSON structure), auto_apply_rules (JSON, e.g. calendar keyword matching)

**prompts**: id, name, content (prompt template text), is_favorite, is_auto_run, created_at

### Key Behaviors

- Templates define auto-summary structure (sections like "Action Items", "Key Decisions").
- Prompts with `is_auto_run = true` execute automatically on transcription completion.
- Categories can auto-assign based on calendar event keywords.
- Audio files stored at `~/Library/Application Support/Nootle/recordings/`.

## LLM Integration

Unified `LlmProvider` trait with async chat and streaming methods. Implementations for:

| Provider | Connection | Models |
|---|---|---|
| OpenAI | `async-openai` crate | GPT-4o, GPT-4o-mini, o1, o3 |
| Anthropic | `reqwest` | Claude Sonnet, Opus, Haiku |
| Google | `reqwest` (Gemini REST) | Gemini 2.0 Flash, Pro |
| Groq | `reqwest` (OpenAI-compatible) | Llama, Mixtral, Gemma |
| Ollama | `reqwest` (localhost:11434) | Any local model |

API keys stored in macOS Keychain via `security-framework` crate.

### Summary Flow

1. Transcription completes, check for auto-run prompts.
2. Format transcript + prompt template, send to default provider.
3. Store result in summaries table.
4. User can manually run any prompt against any meeting with provider/model choice.

### Chat with Transcript

Full transcript injected as context. Streaming responses. Conversation history persisted per meeting in SQLite.

## MCP Server

Bundled inside Tauri process. Stdio-based for tool integration.

### Tools

| Tool | Description |
|---|---|
| `list_meetings` | List meetings with filters (date, category, search) |
| `get_meeting` | Full meeting details, transcript, summaries |
| `search_transcripts` | FTS5 search across all transcripts |
| `get_summary` | Get a specific summary |
| `generate_summary` | Run a prompt against a meeting transcript |
| `list_categories` | List meeting categories |
| `list_templates` | List meeting templates |

### Resources

| Resource | URI |
|---|---|
| Transcript | `nootle://meetings/{id}/transcript` |
| Summary | `nootle://meetings/{id}/summary/{summary_id}` |
| Audio | `nootle://meetings/{id}/audio` |

### Connection

Users add to their AI tool's MCP config:

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

## Frontend

React 18 + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion.

### Screens

1. **Home / Meeting Library** -- Card grid or list, filter by category, search by keyword. Cards show title, date, duration, category badge, summary preview.
2. **Recording View** -- Minimal. Waveform visualization, live transcript streaming, speaker labels in real-time. Timer, editable title, single Stop button.
3. **Meeting Detail** -- Left: searchable transcript with speaker labels and timestamps, clickable to jump in audio. Right: summary panel, switchable by prompt/template. Bottom: audio player with waveform synced to transcript.
4. **AI Chat** -- Slide-over panel from meeting detail. Chat interface for transcript questions. Provider/model selector.
5. **Templates & Prompts** -- Manage templates and prompts. Drag-to-reorder, toggle auto-run, favorite prompts.
6. **Settings** -- API keys per provider, audio device selection, notification preferences, calendar sync, categories, theme (light/dark/system).

### Design Principles

- Neutral palette, generous whitespace, subtle animations
- Dark mode default with system-aware toggle
- Typography-focused: transcript is the hero
- App launch under 500ms to interactive

## Permissions

| Permission | Reason |
|---|---|
| Screen Recording | Core Audio Process Tap (system audio) |
| Microphone | Mic input capture |
| Notifications | Meeting detection alerts |
| Calendar | EventKit calendar access |
| Accessibility (optional) | Detect meeting windows by title |

Guided onboarding flow on first launch walks through each permission.

## Error Handling

- Audio capture failure: fallback to mic-only with notification
- Model not downloaded: prompt with progress bar
- API key missing/invalid: error in UI, redirect to Settings
- CoreML compilation failure: diagnostic info, macOS version check

## Testing

- Rust unit tests: audio pipeline, transcription, SQLite, MCP protocol
- React component tests: Vitest + Testing Library
- E2E: Tauri WebDriver for critical flows

## Requirements

- macOS 14 (Sonoma) or later
- Apple Silicon (M1+)

## Key Dependencies

| Crate | Purpose |
|---|---|
| `tauri` 2.x | Desktop app framework |
| `cidre` | Core Audio Process Tap |
| `cpal` | Cross-platform audio I/O (mic) |
| `ort` | ONNX Runtime (Parakeet preprocessing) |
| `pyannote-rs` | Speaker diarization |
| `rusqlite` | SQLite with FTS5 |
| `sysinfo` | Process monitoring |
| `reqwest` | HTTP client for LLM APIs |
| `async-openai` | OpenAI API client |
| `security-framework` | macOS Keychain |
| `notify-rust` | macOS notifications |
| `tokio` | Async runtime |
