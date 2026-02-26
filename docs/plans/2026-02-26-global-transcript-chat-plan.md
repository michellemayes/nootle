# Global Transcript Chat — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add RAG-powered cross-meeting chat with a floating global panel, backed by sqlite-vec embeddings and a local ONNX embedding model.

**Architecture:** Transcript segments are chunked (~500 tokens) and embedded via a local ONNX model (all-MiniLM-L6-v2) into sqlite-vec. A floating chat panel accessible from any page lets users filter by category/date range and ask questions. Retrieved chunks are injected as LLM context with inline source citations.

**Tech Stack:** Rust (ONNX Runtime, sqlite-vec, rusqlite), React/TypeScript (floating panel, Framer Motion), Tauri IPC commands.

---

### Task 1: Add sqlite-vec dependency and create embedding tables

**Files:**
- Modify: `src-tauri/Cargo.toml` (add sqlite-vec crate)
- Modify: `src-tauri/src/db.rs:155-282` (add tables to `initialize()`, add structs + CRUD methods)

**Step 1: Add sqlite-vec-rs crate to Cargo.toml**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
sqlite-vec = "0.1"
```

This crate provides the `sqlite_vec::load` function to register the sqlite-vec extension with a rusqlite connection.

**Step 2: Load sqlite-vec extension in Database::new and Database::new_in_memory**

In `src-tauri/src/db.rs`, after opening the connection in both `new()` and `new_in_memory()`, load the extension:

```rust
use sqlite_vec::sqlite3_vec_init;

// Inside new() and new_in_memory(), after Connection::open:
unsafe {
    sqlite_vec::load(&conn)?;
}
```

**Step 3: Add new tables to the `initialize()` method**

Append to the `execute_batch` SQL in `db.rs:initialize()`:

```sql
CREATE TABLE IF NOT EXISTS transcript_chunks (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    speaker_labels TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS embedding_config (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
    chunk_id TEXT PRIMARY KEY,
    embedding float[384]
);
```

**Step 4: Add Rust structs for TranscriptChunk**

Add to `db.rs` near the other structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptChunk {
    pub id: String,
    pub meeting_id: String,
    pub chunk_index: i32,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub speaker_labels: String, // JSON array
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkSearchResult {
    pub chunk_id: String,
    pub meeting_id: String,
    pub meeting_title: String,
    pub chunk_text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub speaker_labels: String,
    pub distance: f64,
}
```

**Step 5: Add CRUD methods for chunks and embeddings**

Add to the `impl Database` block:

```rust
pub fn insert_chunk(&self, chunk: &TranscriptChunk) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO transcript_chunks (id, meeting_id, chunk_index, text, start_ms, end_ms, speaker_labels)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![chunk.id, chunk.meeting_id, chunk.chunk_index, chunk.text, chunk.start_ms, chunk.end_ms, chunk.speaker_labels],
    )?;
    Ok(())
}

pub fn insert_chunk_embedding(&self, chunk_id: &str, embedding: &[f32]) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    let blob = embedding.iter().flat_map(|f| f.to_le_bytes()).collect::<Vec<u8>>();
    conn.execute(
        "INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES (?1, ?2)",
        params![chunk_id, blob],
    )?;
    Ok(())
}

pub fn search_similar_chunks(
    &self,
    query_embedding: &[f32],
    limit: usize,
    category_ids: &[String],
    date_from: Option<&str>,
    date_to: Option<&str>,
) -> Result<Vec<ChunkSearchResult>> {
    let conn = self.conn.lock().unwrap();
    let blob = query_embedding.iter().flat_map(|f| f.to_le_bytes()).collect::<Vec<u8>>();

    // Build the query with optional filters
    // sqlite-vec KNN query joined with meetings for filtering
    let mut sql = String::from(
        "SELECT ce.chunk_id, tc.meeting_id, m.title, tc.text, tc.start_ms, tc.end_ms, tc.speaker_labels, ce.distance
         FROM chunk_embeddings ce
         JOIN transcript_chunks tc ON tc.id = ce.chunk_id
         JOIN meetings m ON m.id = tc.meeting_id
         WHERE ce.embedding MATCH ?1 AND k = ?2"
    );

    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    param_values.push(Box::new(blob));
    param_values.push(Box::new(limit as i64));

    if !category_ids.is_empty() {
        let placeholders: Vec<String> = category_ids.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 3))
            .collect();
        sql.push_str(&format!(" AND m.category_id IN ({})", placeholders.join(",")));
        for cid in category_ids {
            param_values.push(Box::new(cid.clone()));
        }
    }

    let next_param = param_values.len() + 1;
    if let Some(from) = date_from {
        sql.push_str(&format!(" AND m.start_time >= ?{}", next_param));
        param_values.push(Box::new(from.to_string()));
    }
    let next_param = param_values.len() + 1;
    if let Some(to) = date_to {
        sql.push_str(&format!(" AND m.start_time <= ?{}", next_param));
        param_values.push(Box::new(to.to_string()));
    }

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let results = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(ChunkSearchResult {
                chunk_id: row.get(0)?,
                meeting_id: row.get(1)?,
                meeting_title: row.get(2)?,
                chunk_text: row.get(3)?,
                start_ms: row.get(4)?,
                end_ms: row.get(5)?,
                speaker_labels: row.get(6)?,
                distance: row.get(7)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(results)
}

pub fn get_embedding_status(&self) -> Result<(u32, u32)> {
    let conn = self.conn.lock().unwrap();
    let total: u32 = conn.query_row(
        "SELECT COUNT(DISTINCT id) FROM meetings WHERE status IN ('transcribing', 'summarized', 'archived')",
        [],
        |row| row.get(0),
    )?;
    let embedded: u32 = conn.query_row(
        "SELECT COUNT(DISTINCT meeting_id) FROM transcript_chunks",
        [],
        |row| row.get(0),
    )?;
    Ok((embedded, total))
}

pub fn has_meeting_chunks(&self, meeting_id: &str) -> Result<bool> {
    let conn = self.conn.lock().unwrap();
    let count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM transcript_chunks WHERE meeting_id = ?1",
        params![meeting_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn delete_meeting_chunks(&self, meeting_id: &str) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    // Delete embeddings first (via chunk IDs)
    conn.execute(
        "DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM transcript_chunks WHERE meeting_id = ?1)",
        params![meeting_id],
    )?;
    conn.execute(
        "DELETE FROM transcript_chunks WHERE meeting_id = ?1",
        params![meeting_id],
    )?;
    Ok(())
}
```

**Step 6: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo check -p nootle-app`
Expected: compiles with no errors (warnings OK)

**Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/db.rs
git commit -m "feat: add sqlite-vec tables and CRUD for transcript chunk embeddings"
```

---

### Task 2: Add embedding model to model registry

**Files:**
- Modify: `src-tauri/src/model_registry.rs:1-267` (add Embedding model category + model definition)

**Step 1: Add Embedding variant to ModelCategory enum**

In `model_registry.rs:4-7`, add `Embedding` to the enum:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ModelCategory {
    Transcription,
    Diarization,
    Embedding,
}
```

**Step 2: Add embedding model file definitions**

After the `DIARIZATION_VARIANTS` const (line ~139), add:

```rust
// ── Embedding (all-MiniLM-L6-v2) ───────────────────────────────────

const EMBEDDING_FILES: &[ModelFile] = &[ModelFile {
    local_name: "model.onnx",
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx",
    size_bytes: 86_000_000,
    sha256: "",
}];

const EMBEDDING_VARIANTS: &[ModelVariant] = &[ModelVariant {
    id: "default",
    label: "Sentence Embeddings (≈86 MB)",
    files: EMBEDDING_FILES,
    total_size_bytes: 86_000_000,
}];
```

**Step 3: Add to MODEL_REGISTRY**

Add a third entry to the `MODEL_REGISTRY` array:

```rust
ModelDefinition {
    id: "embedding-minilm",
    name: "Sentence Embeddings",
    description: "all-MiniLM-L6-v2 for semantic search across transcripts",
    category: ModelCategory::Embedding,
    dir_name: "embedding-minilm",
    variants: EMBEDDING_VARIANTS,
},
```

**Step 4: Update model registry tests**

Update `registry_has_two_models` test to expect 3:

```rust
#[test]
fn registry_has_three_models() {
    assert_eq!(MODEL_REGISTRY.len(), 3);
}
```

Add a new test:

```rust
#[test]
fn embedding_model_exists() {
    let model = get_model("embedding-minilm").unwrap();
    assert_eq!(model.variants.len(), 1);
    assert_eq!(model.category, ModelCategory::Embedding);
}
```

**Step 5: Run tests**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo test -p nootle-app -- model_registry`
Expected: all tests pass

**Step 6: Commit**

```bash
git add src-tauri/src/model_registry.rs
git commit -m "feat: add all-MiniLM-L6-v2 embedding model to registry"
```

---

### Task 3: Create the embedding engine (ONNX inference)

**Files:**
- Create: `src-tauri/src/embedding.rs`
- Modify: `src-tauri/src/lib.rs:1` (add `pub mod embedding;`)

**Step 1: Create embedding.rs**

Create `src-tauri/src/embedding.rs`:

```rust
//! Sentence embedding engine using all-MiniLM-L6-v2 via ONNX Runtime.
//!
//! Produces 384-dimensional normalized embeddings for semantic search.

use anyhow::{anyhow, Context};
use ndarray::{Array1, Array2};
use ort::session::Session;
use ort::value::Tensor;
use std::path::PathBuf;

const MODEL_DIR_NAME: &str = "embedding-minilm";
const EMBEDDING_DIM: usize = 384;

/// Simple whitespace tokenizer that maps words to integer IDs.
/// all-MiniLM-L6-v2 uses a WordPiece tokenizer; we ship a simplified
/// version that covers the common case. For production quality, consider
/// the `tokenizers` crate.
///
/// For now we use a basic approach: the ONNX model accepts input_ids,
/// attention_mask, and token_type_ids. We load the tokenizer vocabulary
/// and do basic tokenization.

pub struct EmbeddingEngine {
    session: Session,
    tokenizer: Tokenizer,
}

/// Minimal WordPiece-style tokenizer backed by the model's vocab.txt.
struct Tokenizer {
    vocab: std::collections::HashMap<String, i64>,
    cls_id: i64,
    sep_id: i64,
    unk_id: i64,
}

impl Tokenizer {
    fn load(vocab_path: &std::path::Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(vocab_path)
            .context("Failed to read tokenizer vocab")?;
        let vocab: std::collections::HashMap<String, i64> = content
            .lines()
            .enumerate()
            .map(|(i, line)| (line.to_string(), i as i64))
            .collect();
        let cls_id = *vocab.get("[CLS]").unwrap_or(&101);
        let sep_id = *vocab.get("[SEP]").unwrap_or(&102);
        let unk_id = *vocab.get("[UNK]").unwrap_or(&100);
        Ok(Self { vocab, cls_id, sep_id, unk_id })
    }

    fn encode(&self, text: &str, max_length: usize) -> (Vec<i64>, Vec<i64>, Vec<i64>) {
        let mut input_ids = vec![self.cls_id];
        let lower = text.to_lowercase();
        for word in lower.split_whitespace() {
            if input_ids.len() >= max_length - 1 {
                break;
            }
            let id = self.vocab.get(word).copied().unwrap_or(self.unk_id);
            input_ids.push(id);
        }
        input_ids.push(self.sep_id);
        let len = input_ids.len();
        let attention_mask = vec![1i64; len];
        let token_type_ids = vec![0i64; len];
        (input_ids, attention_mask, token_type_ids)
    }
}

impl EmbeddingEngine {
    pub fn model_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Nootle")
            .join("models")
            .join(MODEL_DIR_NAME)
    }

    pub fn is_available() -> bool {
        let dir = Self::model_dir();
        dir.join("model.onnx").exists()
    }

    pub fn load() -> anyhow::Result<Self> {
        let model_dir = Self::model_dir();
        if !model_dir.exists() {
            return Err(anyhow!("Embedding model not found. Please download it first."));
        }

        let model_path = model_dir.join("model.onnx");
        let vocab_path = model_dir.join("vocab.txt");

        let session = Session::builder()?
            .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)?
            .commit_from_file(&model_path)
            .context("Failed to load embedding ONNX model")?;

        let tokenizer = Tokenizer::load(&vocab_path)?;

        Ok(Self { session, tokenizer })
    }

    /// Embed a single text string, returning a 384-dim normalized vector.
    pub fn embed(&self, text: &str) -> anyhow::Result<Vec<f32>> {
        let (input_ids, attention_mask, token_type_ids) = self.tokenizer.encode(text, 512);
        let seq_len = input_ids.len();

        let ids_array = Array2::from_shape_vec((1, seq_len), input_ids)?;
        let mask_array = Array2::from_shape_vec((1, seq_len), attention_mask)?;
        let types_array = Array2::from_shape_vec((1, seq_len), token_type_ids)?;

        let outputs = self.session.run(
            ort::inputs![
                Tensor::from_array(ids_array)?,
                Tensor::from_array(mask_array)?,
                Tensor::from_array(types_array)?,
            ]?
        )?;

        // Output shape: (1, seq_len, 384) — mean pool over seq_len
        let output_tensor = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract embedding tensor")?;
        let view = output_tensor.view();
        let shape = view.shape();

        // Mean pooling over token dimension
        let dim = shape[2];
        let mut pooled = vec![0f32; dim];
        for token_idx in 0..shape[1] {
            for d in 0..dim {
                pooled[d] += view[[0, token_idx, d]];
            }
        }
        let n = shape[1] as f32;
        for d in 0..dim {
            pooled[d] /= n;
        }

        // L2 normalize
        let norm: f32 = pooled.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for d in 0..dim {
                pooled[d] /= norm;
            }
        }

        Ok(pooled)
    }

    /// Embed multiple texts. Returns one 384-dim vector per input.
    pub fn embed_batch(&self, texts: &[&str]) -> anyhow::Result<Vec<Vec<f32>>> {
        // For simplicity, process one at a time. Batching can be optimized later.
        texts.iter().map(|t| self.embed(t)).collect()
    }

    pub fn dimensions(&self) -> usize {
        EMBEDDING_DIM
    }
}
```

**Step 2: Register the module**

In `src-tauri/src/lib.rs`, add after the other `pub mod` declarations:

```rust
pub mod embedding;
```

**Step 3: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo check -p nootle-app`
Expected: compiles (warnings about unused OK)

**Step 4: Commit**

```bash
git add src-tauri/src/embedding.rs src-tauri/src/lib.rs
git commit -m "feat: add ONNX embedding engine for all-MiniLM-L6-v2"
```

---

### Task 4: Create the chunking + embedding pipeline

**Files:**
- Create: `src-tauri/src/chunking.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod chunking;`)

**Step 1: Create chunking.rs**

Create `src-tauri/src/chunking.rs`:

```rust
//! Transcript chunking and embedding pipeline.
//!
//! Groups consecutive transcript segments into ~500-token chunks with overlap,
//! embeds each chunk, and stores results in the database.

use crate::db::{Database, TranscriptChunk};
use crate::embedding::EmbeddingEngine;
use anyhow::Context;

const TARGET_CHUNK_TOKENS: usize = 500;
const OVERLAP_TOKENS: usize = 50;

/// Rough token count — split on whitespace.
fn token_count(text: &str) -> usize {
    text.split_whitespace().count()
}

/// Chunk transcript segments into ~500-token windows with ~50-token overlap.
/// Returns (chunk_text, start_ms, end_ms, speaker_labels_json).
pub fn chunk_segments(
    segments: &[crate::db::TranscriptSegment],
) -> Vec<(String, i64, i64, String)> {
    if segments.is_empty() {
        return vec![];
    }

    let mut chunks = Vec::new();
    let mut current_text = String::new();
    let mut current_tokens = 0usize;
    let mut chunk_start_ms = segments[0].start_ms;
    let mut chunk_end_ms = segments[0].end_ms;
    let mut speakers: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut overlap_start_idx: usize = 0;

    for (i, seg) in segments.iter().enumerate() {
        let seg_text = format!("{}: {}", seg.speaker_label, seg.text);
        let seg_tokens = token_count(&seg_text);

        if current_tokens + seg_tokens > TARGET_CHUNK_TOKENS && current_tokens > 0 {
            // Emit current chunk
            let speaker_list: Vec<&str> = speakers.iter().map(|s| s.as_str()).collect();
            let speakers_json = serde_json::to_string(&speaker_list).unwrap_or_else(|_| "[]".to_string());
            chunks.push((current_text.clone(), chunk_start_ms, chunk_end_ms, speakers_json));

            // Start new chunk with overlap: back up to include ~OVERLAP_TOKENS
            current_text.clear();
            current_tokens = 0;
            speakers.clear();

            // Find overlap start: walk backward from current position
            let mut overlap_tokens = 0;
            let mut j = i;
            while j > overlap_start_idx && overlap_tokens < OVERLAP_TOKENS {
                let prev = &segments[j - 1];
                overlap_tokens += token_count(&format!("{}: {}", prev.speaker_label, prev.text));
                j -= 1;
            }
            overlap_start_idx = i; // Next chunk's overlap can't go further back than here

            // Re-add overlap segments
            for seg_idx in j..i {
                let s = &segments[seg_idx];
                let t = format!("{}: {}\n", s.speaker_label, s.text);
                current_tokens += token_count(&t);
                current_text.push_str(&t);
                speakers.insert(s.speaker_label.clone());
            }
            chunk_start_ms = segments[j].start_ms;
        }

        current_text.push_str(&seg_text);
        current_text.push('\n');
        current_tokens += seg_tokens;
        chunk_end_ms = seg.end_ms;
        speakers.insert(seg.speaker_label.clone());
    }

    // Emit final chunk
    if current_tokens > 0 {
        let speaker_list: Vec<&str> = speakers.iter().map(|s| s.as_str()).collect();
        let speakers_json = serde_json::to_string(&speaker_list).unwrap_or_else(|_| "[]".to_string());
        chunks.push((current_text, chunk_start_ms, chunk_end_ms, speakers_json));
    }

    chunks
}

/// Chunk and embed a meeting's transcript, storing results in the database.
/// Skips if already embedded. Returns the number of chunks created.
pub fn embed_meeting(
    db: &Database,
    engine: &EmbeddingEngine,
    meeting_id: &str,
) -> anyhow::Result<usize> {
    // Skip if already embedded
    if db.has_meeting_chunks(meeting_id)? {
        return Ok(0);
    }

    let segments = db.get_transcript(meeting_id)?;
    if segments.is_empty() {
        return Ok(0);
    }

    let raw_chunks = chunk_segments(&segments);

    for (i, (text, start_ms, end_ms, speakers_json)) in raw_chunks.iter().enumerate() {
        let chunk_id = uuid::Uuid::new_v4().to_string();
        let chunk = TranscriptChunk {
            id: chunk_id.clone(),
            meeting_id: meeting_id.to_string(),
            chunk_index: i as i32,
            text: text.clone(),
            start_ms: *start_ms,
            end_ms: *end_ms,
            speaker_labels: speakers_json.clone(),
        };
        db.insert_chunk(&chunk)?;

        let embedding = engine.embed(text).context("Failed to embed chunk")?;
        db.insert_chunk_embedding(&chunk_id, &embedding)?;
    }

    Ok(raw_chunks.len())
}
```

**Step 2: Register the module**

In `src-tauri/src/lib.rs`, add:

```rust
pub mod chunking;
```

**Step 3: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo check -p nootle-app`
Expected: compiles

**Step 4: Commit**

```bash
git add src-tauri/src/chunking.rs src-tauri/src/lib.rs
git commit -m "feat: add transcript chunking and embedding pipeline"
```

---

### Task 5: Add Tauri commands for global chat

**Files:**
- Modify: `src-tauri/src/commands.rs` (add new commands + EmbeddingState type)
- Modify: `src-tauri/src/lib.rs` (manage EmbeddingState, register commands)

**Step 1: Add EmbeddingState type alias and new commands to commands.rs**

Add the type alias near the other state types (line ~18):

```rust
use crate::embedding::EmbeddingEngine;

pub type EmbeddingState = Arc<TokioMutex<Option<EmbeddingEngine>>>;
```

Add the new commands at the end of `commands.rs`:

```rust
// Global chat commands

#[tauri::command]
pub async fn chat_with_transcripts(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    embedding_state: State<'_, EmbeddingState>,
    message: String,
    history: Vec<ChatMessage>,
    provider: String,
    model: String,
    category_ids: Vec<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<serde_json::Value, String> {
    // Get embedding engine
    let engine_lock = embedding_state.lock().await;
    let engine = engine_lock
        .as_ref()
        .ok_or_else(|| "Embedding model not loaded. Please download it first.".to_string())?;

    // Embed the query
    let query_embedding = engine
        .embed(&message)
        .map_err(|e| format!("Failed to embed query: {e}"))?;
    drop(engine_lock);

    // Search for similar chunks
    let results = db
        .search_similar_chunks(
            &query_embedding,
            10,
            &category_ids,
            date_from.as_deref(),
            date_to.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    if results.is_empty() {
        return Ok(serde_json::json!({
            "response": "I couldn't find any relevant transcript passages for your question. Try adjusting your filters or asking a different question.",
            "sources": []
        }));
    }

    // Build context from retrieved chunks
    let mut context_parts = Vec::new();
    let mut sources = Vec::new();
    for result in &results {
        let timestamp = crate::summarization::format_ms(result.start_ms);
        context_parts.push(format!(
            "---\n[Meeting: \"{}\", {}]\n{}\n",
            result.meeting_title, timestamp, result.chunk_text
        ));
        sources.push(serde_json::json!({
            "meeting_id": result.meeting_id,
            "meeting_title": result.meeting_title,
            "start_ms": result.start_ms,
            "end_ms": result.end_ms,
        }));
    }

    let system_prompt = format!(
        "You are Nootle, an AI assistant that answers questions about the user's meetings.\n\n\
         Below are relevant excerpts from the user's meeting transcripts. Each excerpt \
         includes the meeting title and timestamp. Use ONLY these excerpts to answer.\n\
         When you reference information, cite the source as [Meeting Title, timestamp].\n\n\
         {}\n\
         Answer the user's question based on these excerpts. Be concise.",
        context_parts.join("\n")
    );

    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: system_prompt,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".into(),
        content: message,
    });

    let llm = llm.read().await;
    let llm_provider = llm
        .get_provider(&provider)
        .ok_or_else(|| format!("Provider '{}' not found", provider))?;
    let response = llm_provider
        .chat(messages, &model)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "response": response,
        "sources": sources
    }))
}

#[tauri::command]
pub async fn embed_meeting_cmd(
    db: State<'_, DbState>,
    embedding_state: State<'_, EmbeddingState>,
    meeting_id: String,
) -> Result<usize, String> {
    let engine_lock = embedding_state.lock().await;
    let engine = engine_lock
        .as_ref()
        .ok_or_else(|| "Embedding model not loaded".to_string())?;
    crate::chunking::embed_meeting(&db, engine, &meeting_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn embed_all_meetings(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    embedding_state: State<'_, EmbeddingState>,
) -> Result<(), String> {
    let engine_lock = embedding_state.lock().await;
    let engine = engine_lock
        .as_ref()
        .ok_or_else(|| "Embedding model not loaded".to_string())?;

    let meetings = db.list_meetings(None, None).map_err(|e| e.to_string())?;
    let total = meetings.len();
    for (i, meeting) in meetings.iter().enumerate() {
        match crate::chunking::embed_meeting(&db, engine, &meeting.id) {
            Ok(_) => {}
            Err(e) => tracing::warn!("Failed to embed meeting {}: {e}", meeting.id),
        }
        let _ = app.emit("embedding-progress", serde_json::json!({
            "current": i + 1,
            "total": total,
        }));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_embedding_status(
    db: State<'_, DbState>,
    embedding_state: State<'_, EmbeddingState>,
) -> Result<serde_json::Value, String> {
    let (embedded, total) = db.get_embedding_status().map_err(|e| e.to_string())?;
    let engine_lock = embedding_state.lock().await;
    let model_available = engine_lock.is_some();
    Ok(serde_json::json!({
        "embedded": embedded,
        "total": total,
        "model_available": model_available,
    }))
}
```

**Step 2: Make `format_ms` public**

In `src-tauri/src/summarization.rs`, change line 135 from `fn format_ms` to `pub fn format_ms`.

**Step 3: Initialize EmbeddingState in lib.rs**

In `src-tauri/src/lib.rs`, add after the `download_manager` line (~58):

```rust
// Try to load embedding engine if model is available
let embedding_engine = if embedding::EmbeddingEngine::is_available() {
    match embedding::EmbeddingEngine::load() {
        Ok(e) => Some(e),
        Err(err) => {
            tracing::warn!("Failed to load embedding engine: {err}");
            None
        }
    }
} else {
    None
};
let embedding_state: commands::EmbeddingState = Arc::new(TokioMutex::new(embedding_engine));
```

Add `.manage(embedding_state)` after `.manage(download_manager)`.

**Step 4: Register the new commands in the invoke_handler**

Add to the `generate_handler!` macro:

```rust
commands::chat_with_transcripts,
commands::embed_meeting_cmd,
commands::embed_all_meetings,
commands::get_embedding_status,
```

**Step 5: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo check -p nootle-app`
Expected: compiles

**Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/src/summarization.rs
git commit -m "feat: add Tauri commands for global transcript chat and embedding"
```

---

### Task 6: Wire embedding into post-transcription pipeline

**Files:**
- Modify: `src-tauri/src/commands.rs:249-323` (add embedding call after transcription in `run_transcription_pipeline`)

**Step 1: Pass EmbeddingState into the transcription pipeline**

In the `start_recording` command (~line 233), pass the embedding state to the pipeline:

```rust
if let Some(audio_rx) = session.take_audio_rx() {
    let db_clone = db.inner().clone();
    let embedding_clone = embedding_state.inner().clone();
    let meeting_id = meeting.id.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        run_transcription_pipeline(audio_rx, db_clone, embedding_clone, meeting_id, app_handle).await;
    });
}
```

Update the `start_recording` signature to accept EmbeddingState:

```rust
pub async fn start_recording(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    recording: State<'_, RecordingState>,
    embedding_state: State<'_, EmbeddingState>,
    // ... rest unchanged
```

**Step 2: Update run_transcription_pipeline to embed after receiving all chunks**

Update the function signature and add embedding at the end:

```rust
async fn run_transcription_pipeline(
    mut audio_rx: tokio::sync::mpsc::Receiver<Vec<f32>>,
    db: Arc<Database>,
    embedding_state: Arc<TokioMutex<Option<EmbeddingEngine>>>,
    meeting_id: String,
    app: tauri::AppHandle,
) {
    // ... existing transcription loop unchanged ...

    // After the while loop (when audio_rx closes), embed the meeting
    let engine_lock = embedding_state.lock().await;
    if let Some(ref engine) = *engine_lock {
        match crate::chunking::embed_meeting(&db, engine, &meeting_id) {
            Ok(count) => tracing::info!("Embedded {count} chunks for meeting {meeting_id}"),
            Err(e) => tracing::warn!("Failed to embed meeting {meeting_id}: {e}"),
        }
    }
}
```

Add the import at the top of `commands.rs`:

```rust
use crate::embedding::EmbeddingEngine;
```

**Step 3: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo check -p nootle-app`
Expected: compiles

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: embed transcripts eagerly after recording completes"
```

---

### Task 7: Add TypeScript types and useGlobalChat hook

**Files:**
- Modify: `src/types.ts` (add new types)
- Create: `src/hooks/useGlobalChat.ts`

**Step 1: Add new types to types.ts**

Append to `src/types.ts`:

```typescript
export interface ChatSource {
  meeting_id: string;
  meeting_title: string;
  start_ms: number;
  end_ms: number;
}

export interface GlobalChatResponse {
  response: string;
  sources: ChatSource[];
}

export interface GlobalChatMessage {
  role: string;
  content: string;
  sources?: ChatSource[];
}

export interface EmbeddingStatus {
  embedded: number;
  total: number;
  model_available: boolean;
}
```

**Step 2: Create useGlobalChat.ts**

Create `src/hooks/useGlobalChat.ts`:

```typescript
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  GlobalChatMessage,
  GlobalChatResponse,
  EmbeddingStatus,
} from "@/types";

export function useGlobalChat() {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(null);

  const refreshEmbeddingStatus = useCallback(async () => {
    try {
      const status = await invoke<EmbeddingStatus>("get_embedding_status");
      setEmbeddingStatus(status);
    } catch {
      // Ignore errors during status fetch
    }
  }, []);

  useEffect(() => {
    refreshEmbeddingStatus();
  }, [refreshEmbeddingStatus]);

  const sendMessage = useCallback(
    async (message: string, provider: string, model: string) => {
      const userMsg: GlobalChatMessage = { role: "user", content: message };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      try {
        // Build history from previous messages (without sources, as ChatMessage)
        const history: ChatMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await invoke<GlobalChatResponse>(
          "chat_with_transcripts",
          {
            message,
            history: [...history, { role: "user", content: message }],
            provider,
            model,
            categoryIds,
            dateFrom,
            dateTo,
          }
        );

        const assistantMsg: GlobalChatMessage = {
          role: "assistant",
          content: result.response,
          sources: result.sources,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        return result;
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [messages, categoryIds, dateFrom, dateTo]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const setFilters = useCallback(
    (cats: string[], from: string | null, to: string | null) => {
      setCategoryIds(cats);
      setDateFrom(from);
      setDateTo(to);
      // Clear conversation when filters change
      setMessages([]);
      setError(null);
    },
    []
  );

  const embedAllMeetings = useCallback(async () => {
    try {
      await invoke("embed_all_meetings");
      await refreshEmbeddingStatus();
    } catch (err) {
      setError(String(err));
    }
  }, [refreshEmbeddingStatus]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
    categoryIds,
    dateFrom,
    dateTo,
    setFilters,
    embeddingStatus,
    refreshEmbeddingStatus,
    embedAllMeetings,
  };
}
```

**Step 3: Commit**

```bash
git add src/types.ts src/hooks/useGlobalChat.ts
git commit -m "feat: add useGlobalChat hook and TypeScript types"
```

---

### Task 8: Build the GlobalChatPanel component

**Files:**
- Create: `src/components/GlobalChatPanel.tsx`

**Step 1: Create GlobalChatPanel.tsx**

Create `src/components/GlobalChatPanel.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { ThinkingDots } from "@/components/ThinkingDots";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/Markdown";
import { useGlobalChat } from "@/hooks/useGlobalChat";
import { useCategories } from "@/hooks/useCategories";
import { useLLM } from "@/hooks/useLLM";
import type { ChatSource } from "@/types";
import {
  X,
  MessageSquare,
  GripHorizontal,
  ChevronDown,
} from "lucide-react";

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
] as const;

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function SourceCitation({
  source,
  onClick,
}: {
  source: ChatSource;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors"
    >
      {source.meeting_title}, {formatTimestamp(source.start_ms)}
    </button>
  );
}

export function GlobalChatPanel() {
  const [open, setOpen] = useState(false);
  const {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
    categoryIds,
    setFilters,
    embeddingStatus,
    embedAllMeetings,
  } = useGlobalChat();
  const { categories } = useCategories();
  const { models, providers } = useLLM();
  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedDatePreset, setSelectedDatePreset] = useState(3); // "All time"
  const [embedding, setEmbedding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Default provider/model
  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (selectedProvider && models.length > 0 && !selectedModel) {
      const providerModels = models.filter(
        (m) => m.provider === selectedProvider
      );
      if (providerModels.length > 0) {
        setSelectedModel(providerModels[0].id);
      }
    }
  }, [selectedProvider, models, selectedModel]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !selectedProvider || !selectedModel) return;
    const msg = input;
    setInput("");
    await sendMessage(msg, selectedProvider, selectedModel);
  };

  const handleCategoryToggle = (catId: string) => {
    const newCats = categoryIds.includes(catId)
      ? categoryIds.filter((id) => id !== catId)
      : [...categoryIds, catId];
    const preset = DATE_PRESETS[selectedDatePreset];
    const dateFrom = preset.days
      ? new Date(Date.now() - preset.days * 86400000).toISOString()
      : null;
    setFilters(newCats, dateFrom, null);
  };

  const handleDatePresetChange = (idx: number) => {
    setSelectedDatePreset(idx);
    const preset = DATE_PRESETS[idx];
    const dateFrom = preset.days
      ? new Date(Date.now() - preset.days * 86400000).toISOString()
      : null;
    setFilters(categoryIds, dateFrom, null);
  };

  const handleEmbedAll = async () => {
    setEmbedding(true);
    await embedAllMeetings();
    setEmbedding(false);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y),
      });
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  const filteredModels = models.filter(
    (m) => m.provider === selectedProvider
  );

  const modelNotReady =
    embeddingStatus && !embeddingStatus.model_available;
  const needsBackfill =
    embeddingStatus &&
    embeddingStatus.model_available &&
    embeddingStatus.embedded < embeddingStatus.total;

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-shadow"
            title="Ask across meetings"
          >
            <MessageSquare className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
            }}
            className="fixed bottom-6 right-6 z-50 flex w-[400px] h-[600px] flex-col rounded-xl border bg-background shadow-2xl"
          >
            {/* Header */}
            <div
              onMouseDown={handleDragStart}
              className="flex items-center justify-between px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-2">
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">
                  Ask across meetings
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-2 px-4 py-2 border-b">
              <div className="flex items-center gap-2">
                {/* Category multi-select */}
                <div className="relative flex-1">
                  <select
                    multiple
                    value={categoryIds}
                    onChange={(e) => {
                      const selected = Array.from(
                        e.target.selectedOptions,
                        (o) => o.value
                      );
                      const preset = DATE_PRESETS[selectedDatePreset];
                      const dateFrom = preset.days
                        ? new Date(
                            Date.now() - preset.days * 86400000
                          ).toISOString()
                        : null;
                      setFilters(selected, dateFrom, null);
                    }}
                    className="h-7 w-full rounded-md border bg-transparent px-2 text-xs"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date preset */}
                <select
                  value={selectedDatePreset}
                  onChange={(e) =>
                    handleDatePresetChange(Number(e.target.value))
                  }
                  className="h-7 rounded-md border bg-transparent px-2 text-xs"
                >
                  {DATE_PRESETS.map((preset, i) => (
                    <option key={i} value={i}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              {embeddingStatus && (
                <p className="text-xs text-muted-foreground">
                  {embeddingStatus.embedded} of {embeddingStatus.total}{" "}
                  meetings indexed
                </p>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div
                ref={scrollRef}
                className="flex flex-col gap-3 p-4"
              >
                {modelNotReady && (
                  <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
                    <p className="mb-2">
                      Download the embedding model in Settings to
                      search across meetings.
                    </p>
                  </div>
                )}

                {!modelNotReady && needsBackfill && (
                  <div className="rounded-lg bg-muted p-4 text-center text-sm">
                    <p className="mb-2 text-muted-foreground">
                      {embeddingStatus!.total -
                        embeddingStatus!.embedded}{" "}
                      meetings need indexing for search.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleEmbedAll}
                      disabled={embedding}
                    >
                      {embedding ? "Indexing..." : "Index All"}
                    </Button>
                  </div>
                )}

                {messages.length === 0 &&
                  !modelNotReady &&
                  !needsBackfill && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      Ask anything about your meetings
                    </p>
                  )}

                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <Markdown content={msg.content} />
                      ) : (
                        msg.content
                      )}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.sources.map((source, j) => (
                            <SourceCitation
                              key={j}
                              source={source}
                              onClick={() => {
                                setOpen(false);
                                navigate(
                                  `/meeting/${source.meeting_id}`
                                );
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                      <ThinkingDots />
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-xs text-destructive text-center">
                    {error}
                  </p>
                )}
              </div>
            </ScrollArea>

            <Separator />

            {/* Provider/Model selector */}
            <div className="flex items-center gap-2 px-4 py-2 border-b">
              <select
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setSelectedModel("");
                }}
                className="h-7 flex-1 rounded-md border bg-transparent px-2 text-xs"
              >
                <option value="">Provider</option>
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-7 flex-1 rounded-md border bg-transparent px-2 text-xs"
              >
                <option value="">Model</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 p-3">
              <Input
                placeholder="Ask about your meetings..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={loading || modelNotReady}
                className="flex-1"
              />
              <MotionButton
                size="sm"
                onClick={handleSend}
                disabled={loading || !input.trim() || modelNotReady}
              >
                Ask
              </MotionButton>
            </div>

            {/* Clear button */}
            <div className="px-3 pb-3">
              <Button
                variant="ghost"
                size="xs"
                className="w-full text-muted-foreground"
                onClick={clearMessages}
              >
                Clear conversation
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/GlobalChatPanel.tsx
git commit -m "feat: add GlobalChatPanel floating component"
```

---

### Task 9: Mount GlobalChatPanel in the app layout

**Files:**
- Modify: `src/App.tsx:14-21` (add GlobalChatPanel to Layout)

**Step 1: Import and add GlobalChatPanel to Layout**

In `src/App.tsx`, add the import:

```typescript
import { GlobalChatPanel } from "@/components/GlobalChatPanel";
```

Update the `Layout` component:

```tsx
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <GlobalChatPanel />
    </div>
  );
}
```

**Step 2: Verify the frontend builds**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && npm run build`
Expected: builds without errors

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount GlobalChatPanel in app layout"
```

---

### Task 10: Verify full build and manual test

**Step 1: Run full Rust build**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo build -p nootle-app`
Expected: compiles successfully

**Step 2: Run Rust tests**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && cargo test -p nootle-app`
Expected: all tests pass

**Step 3: Run frontend build**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && npm run build`
Expected: builds without errors

**Step 4: Run TypeScript type checking**

Run: `cd /Users/michelle/conductor/workspaces/nootle/perth && npx tsc --noEmit`
Expected: no type errors

**Step 5: Commit any fixes if needed**

If any compilation or test issues are found, fix them and commit with an appropriate message.
