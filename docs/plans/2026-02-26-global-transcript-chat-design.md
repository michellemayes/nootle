# Global Transcript Chat — Design

Chat with past transcripts across meetings, filtered by category and date range, powered by local RAG with sqlite-vec.

## Problem

The existing chat feature is scoped to a single meeting. Users want to ask questions across multiple past transcripts — "What did we decide about the launch?" — without knowing which meeting contains the answer.

## Decisions

- **RAG with embeddings** over transcript chunks, not full-transcript stuffing
- **sqlite-vec** for vector storage — stays in the same SQLite database, no new services
- **Local ONNX embedding model** (all-MiniLM-L6-v2, 384 dimensions, ~80MB) as default, with optional API embedding upgrade via configured LLM providers
- **Eager embedding** — chunks are embedded immediately after transcription completes
- **Floating draggable chat panel** accessible from any page, not a dedicated page or sidebar section
- **Approach A (Monolithic Rust)** — embedding, chunking, and retrieval all in Rust, consistent with existing Parakeet pipeline

## Data Model

### New tables

**transcript_chunks** — Transcript segments grouped into ~500-token chunks.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| meeting_id | TEXT FK | References meetings.id |
| chunk_index | INTEGER | Order within meeting |
| text | TEXT | Concatenated segment text |
| start_ms | INTEGER | Start timestamp of first segment |
| end_ms | INTEGER | End timestamp of last segment |
| speaker_labels | TEXT | JSON array of speakers in chunk |

**chunk_embeddings** — sqlite-vec virtual table for KNN search.

| Column | Type | Description |
|--------|------|-------------|
| chunk_id | TEXT FK | References transcript_chunks.id |
| embedding | BLOB | float32 vector (384 dimensions) |

**embedding_config** — Tracks which model produced embeddings.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| model_name | TEXT | e.g. "all-MiniLM-L6-v2" |
| dimensions | INTEGER | e.g. 384 |
| created_at | TEXT | ISO timestamp |

## Embedding Pipeline

Runs eagerly after transcription completes:

1. Group consecutive transcript segments into ~500-token chunks with ~50-token overlap. Respect speaker boundaries where possible.
2. Run chunks through local ONNX embedding model (or API if configured).
3. Insert chunks into `transcript_chunks`, embeddings into `chunk_embeddings`.

The embedding model downloads via the existing `model_download` system alongside Parakeet and diarization models.

## RAG Retrieval

When the user sends a message to the global chat:

1. Embed the query using the same embedding model.
2. Query sqlite-vec for top-10 nearest chunks, filtered by category and date range (JOIN on `meetings` table).
3. De-duplicate and attach meeting metadata (title, date, speaker labels).
4. Build system prompt with retrieved chunks as numbered context excerpts.
5. Send to LLM with conversation history.
6. Return response with source metadata for citation rendering.

### System prompt structure

```
You are Nootle, an AI assistant that answers questions about the user's meetings.

Below are relevant excerpts from the user's meeting transcripts. Each excerpt
includes the meeting title, date, and speaker. Use ONLY these excerpts to answer.
When you reference information, cite the source as [Meeting Title, timestamp].

---
[Meeting: "Weekly Standup", 2026-02-24, 14:32]
Speaker 1: We decided to postpone the launch until March...
---
[Meeting: "Product Review", 2026-02-20, 10:15]
Speaker 2: The new design is ready for engineering handoff...
---
```

### Filtering

- **Category**: JOIN `meetings.category_id` against selected category IDs. Empty = all.
- **Date range**: WHERE `meetings.start_time` BETWEEN date_from AND date_to. Presets: 7d, 30d, 90d, all time.

## Backend — Tauri Commands

**`chat_with_transcripts`** — Core cross-meeting chat.
- Inputs: `message`, `history`, `provider`, `model`, `category_ids` (Vec, empty = all), `date_from` (Option), `date_to` (Option)
- Returns: response string + source citations (meeting_id, title, start_ms for each referenced chunk)

**`embed_meeting`** — Trigger embedding for a single meeting. Used for backfill.

**`get_embedding_status`** — Returns `{ embedded: u32, total: u32 }` for progress UI.

## Frontend — Global Chat Panel

### Trigger

Floating action button in bottom-right corner. `MessageSquare` icon from Lucide, styled with accent color. Click toggles the panel.

### Panel layout

```
┌─────────────────────────────┐
│  Ask across meetings       ✕ │  Header with close button
├─────────────────────────────┤
│ [Categories ▼] [Last 7d ▼]  │  Filter bar: category multi-select
│ 3 of 47 meetings             │  + date preset + scope indicator
├─────────────────────────────┤
│                              │
│  Messages area               │  Same bubble styling as ChatPanel
│  with inline citations       │  Citations link to /meeting/:id
│                              │
├─────────────────────────────┤
│ [Provider ▼] [Model ▼]      │  Same selector as existing chat
├─────────────────────────────┤
│ [Ask about your meetings...] │  Input + send button
│ [Clear conversation]         │
└─────────────────────────────┘
```

### Behaviors

- ~400px wide, ~600px tall, floats above content
- Draggable by header bar
- Position remembered across page navigations (React state, not persisted)
- Conversation clears when filters change
- Citations are clickable links navigating to `/meeting/:id` at the referenced timestamp
- Empty state: "Download embedding model to use" if model missing, otherwise "Embed your existing meetings" with backfill button

### New hook: `useGlobalChat`

Similar to `useChat` but calls `chat_with_transcripts`. Manages filter state (categories, date range) and embedding status.

## Model Management

- Add `all-MiniLM-L6-v2.onnx` to `model_registry.rs`
- Downloads via existing `model_download.rs` with progress
- Shown in Settings alongside Parakeet + diarization models
- Backfill: one-time "Embed All" in global chat panel with progress indicator

## API Embedding Option

- Settings toggle per provider: "Use API embeddings"
- When enabled, embedding calls go to provider API (OpenAI text-embedding-3-small, etc.) instead of local ONNX
- Embeddings tagged with source model; model switch prompts re-embed (not forced)

## Out of Scope

- Semantic caching of query embeddings
- Hybrid search (FTS5 + vector)
- Conversation persistence across app restarts
- Streaming responses
- Re-ranking model
