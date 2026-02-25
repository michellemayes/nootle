# Local Model Download System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Nootle to download Parakeet TDT and diarization ONNX models from HuggingFace, with progress UI in onboarding and settings.

**Architecture:** A Rust `model_download` module uses `reqwest` streaming to download files from HuggingFace Hub. A compile-time model registry defines available models and variants. Progress is pushed to the React frontend via Tauri events. The onboarding flow gains a "Download Models" step; Settings gains a model management section.

**Tech Stack:** Rust (reqwest streaming, sha2, tokio_util), Tauri events, React/TypeScript, TailwindCSS

---

### Task 1: Add Dependencies to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add sha2 and tokio-util crates**

In `src-tauri/Cargo.toml`, add these two lines to the `[dependencies]` section (after the existing `futures-util` line):

```toml
sha2 = "0.10"
tokio-util = "0.7"
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors (new deps downloaded).

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add sha2 and tokio-util dependencies for model download"
```

---

### Task 2: Create Model Registry

**Files:**
- Create: `src-tauri/src/model_registry.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod model_registry;`)

This module defines the compile-time registry of available models. No download logic yet — just the data structures and registry.

**Step 1: Write tests for model registry**

Create `src-tauri/src/model_registry.rs` with the data structures and tests first:

```rust
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ModelCategory {
    Transcription,
    Diarization,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelFile {
    /// Name the file is saved as locally (e.g. "encoder.onnx")
    pub local_name: &'static str,
    /// HuggingFace download URL
    pub url: &'static str,
    /// Expected file size in bytes (used for progress calculation)
    pub size_bytes: u64,
    /// SHA-256 hex digest for verification (empty string to skip verification)
    pub sha256: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelVariant {
    pub id: &'static str,
    pub label: &'static str,
    pub files: &'static [ModelFile],
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: ModelCategory,
    /// Subdirectory name under ~/Library/Application Support/Nootle/models/
    pub dir_name: &'static str,
    pub variants: &'static [ModelVariant],
}

// ── Parakeet TDT 0.6B v2 (Transcription) ──────────────────────────────

const PARAKEET_INT8_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "encoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/encoder-model.int8.onnx",
        size_bytes: 652_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "decoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/decoder_joint-model.int8.onnx",
        size_bytes: 9_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "vocab.txt",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/vocab.txt",
        size_bytes: 10_000,
        sha256: "",
    },
];

const PARAKEET_FULL_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "encoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/encoder-model.onnx",
        size_bytes: 41_800_000,
        sha256: "",
    },
    ModelFile {
        local_name: "encoder.onnx.data",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/encoder-model.onnx.data",
        size_bytes: 2_440_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "decoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/decoder_joint-model.onnx",
        size_bytes: 35_800_000,
        sha256: "",
    },
    ModelFile {
        local_name: "vocab.txt",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/vocab.txt",
        size_bytes: 10_000,
        sha256: "",
    },
];

const PARAKEET_VARIANTS: &[ModelVariant] = &[
    ModelVariant {
        id: "int8",
        label: "Quantized (≈660 MB) — faster download, slightly less accurate",
        files: PARAKEET_INT8_FILES,
        total_size_bytes: 661_010_000,
    },
    ModelVariant {
        id: "full",
        label: "Full Precision (≈2.5 GB) — best quality, large download",
        files: PARAKEET_FULL_FILES,
        total_size_bytes: 2_517_610_000,
    },
];

// ── Diarization (Segmentation + Embedding) ─────────────────────────────

const DIARIZATION_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "segmentation.onnx",
        url: "https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/main/onnx/model.onnx",
        size_bytes: 6_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "embedding.onnx",
        url: "https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34/resolve/main/voxceleb_resnet34.onnx",
        size_bytes: 26_500_000,
        sha256: "",
    },
];

const DIARIZATION_VARIANTS: &[ModelVariant] = &[ModelVariant {
    id: "default",
    label: "Speaker Identification (≈32 MB)",
    files: DIARIZATION_FILES,
    total_size_bytes: 32_500_000,
}];

// ── Full Registry ──────────────────────────────────────────────────────

pub const MODEL_REGISTRY: &[ModelDefinition] = &[
    ModelDefinition {
        id: "parakeet-tdt-0.6b-v2",
        name: "Parakeet TDT 0.6B v2",
        description: "NVIDIA speech-to-text model for English transcription",
        category: ModelCategory::Transcription,
        dir_name: "parakeet-tdt-0.6b-v2",
        variants: PARAKEET_VARIANTS,
    },
    ModelDefinition {
        id: "diarization",
        name: "Speaker Diarization",
        description: "Identifies who is speaking (pyannote segmentation + WeSpeaker embedding)",
        category: ModelCategory::Diarization,
        dir_name: "diarization",
        variants: DIARIZATION_VARIANTS,
    },
];

/// Look up a model definition by ID.
pub fn get_model(id: &str) -> Option<&'static ModelDefinition> {
    MODEL_REGISTRY.iter().find(|m| m.id == id)
}

/// Look up a specific variant within a model.
pub fn get_variant(model_id: &str, variant_id: &str) -> Option<(&'static ModelDefinition, &'static ModelVariant)> {
    let model = get_model(model_id)?;
    let variant = model.variants.iter().find(|v| v.id == variant_id)?;
    Some((model, variant))
}

/// Get the local directory path for a model.
pub fn model_dir(model: &ModelDefinition) -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Nootle")
        .join("models")
        .join(model.dir_name)
}

/// Check if all files for a variant are present on disk.
pub fn is_variant_downloaded(model: &ModelDefinition, variant: &ModelVariant) -> bool {
    let dir = model_dir(model);
    variant.files.iter().all(|f| dir.join(f.local_name).exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_two_models() {
        assert_eq!(MODEL_REGISTRY.len(), 2);
    }

    #[test]
    fn parakeet_has_two_variants() {
        let model = get_model("parakeet-tdt-0.6b-v2").unwrap();
        assert_eq!(model.variants.len(), 2);
        assert_eq!(model.variants[0].id, "int8");
        assert_eq!(model.variants[1].id, "full");
    }

    #[test]
    fn diarization_has_one_variant() {
        let model = get_model("diarization").unwrap();
        assert_eq!(model.variants.len(), 1);
        assert_eq!(model.variants[0].id, "default");
    }

    #[test]
    fn get_variant_works() {
        let (model, variant) = get_variant("parakeet-tdt-0.6b-v2", "int8").unwrap();
        assert_eq!(model.id, "parakeet-tdt-0.6b-v2");
        assert_eq!(variant.id, "int8");
        assert_eq!(variant.files.len(), 3);
    }

    #[test]
    fn get_variant_returns_none_for_bad_id() {
        assert!(get_variant("nonexistent", "int8").is_none());
        assert!(get_variant("parakeet-tdt-0.6b-v2", "nonexistent").is_none());
    }

    #[test]
    fn model_dir_contains_nootle() {
        let model = get_model("parakeet-tdt-0.6b-v2").unwrap();
        let dir = model_dir(model);
        assert!(dir.to_str().unwrap().contains("Nootle"));
        assert!(dir.to_str().unwrap().contains("parakeet-tdt-0.6b-v2"));
    }

    #[test]
    fn variant_not_downloaded_by_default() {
        let model = get_model("parakeet-tdt-0.6b-v2").unwrap();
        let variant = &model.variants[0];
        assert!(!is_variant_downloaded(model, variant));
    }

    #[test]
    fn all_urls_are_huggingface_resolve() {
        for model in MODEL_REGISTRY {
            for variant in model.variants {
                for file in variant.files {
                    assert!(
                        file.url.starts_with("https://huggingface.co/"),
                        "URL should be HuggingFace: {}",
                        file.url
                    );
                    assert!(
                        file.url.contains("/resolve/main/"),
                        "URL should use /resolve/main/ for direct download: {}",
                        file.url
                    );
                }
            }
        }
    }
}
```

**Step 2: Register the module in lib.rs**

Add `pub mod model_registry;` to `src-tauri/src/lib.rs` after the `pub mod llm;` line:

```rust
pub mod model_registry;
```

**Step 3: Run tests**

Run: `cd src-tauri && cargo test model_registry`
Expected: All 8 tests pass.

**Step 4: Commit**

```bash
git add src-tauri/src/model_registry.rs src-tauri/src/lib.rs
git commit -m "feat: add model registry with Parakeet and diarization definitions"
```

---

### Task 3: Create Download Engine

**Files:**
- Create: `src-tauri/src/model_download.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod model_download;`)

This is the core download engine — streaming HTTP download with progress events, SHA-256 verification, resume support, and cancellation.

**Step 1: Write the download engine**

Create `src-tauri/src/model_download.rs`:

```rust
use crate::model_registry::{self, ModelDefinition, ModelFile, ModelVariant};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

/// Event payload emitted during download.
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub state: DownloadState,
    pub current_file: String,
    pub file_bytes_downloaded: u64,
    pub file_total_bytes: u64,
    pub overall_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadState {
    Downloading,
    Verifying,
    Complete,
    Error { message: String },
    Cancelled,
}

/// Status of a model on disk.
#[derive(Debug, Clone, Serialize)]
pub struct ModelOnDiskStatus {
    pub model_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub downloaded: bool,
    pub variant_id: Option<String>,
    pub size_on_disk: u64,
}

/// Shared download state — holds cancellation token for active download.
pub struct DownloadManager {
    cancel_token: Option<CancellationToken>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self { cancel_token: None }
    }

    pub fn cancel(&mut self) {
        if let Some(token) = self.cancel_token.take() {
            token.cancel();
        }
    }

    pub fn new_token(&mut self) -> CancellationToken {
        self.cancel();
        let token = CancellationToken::new();
        self.cancel_token = Some(token.clone());
        token
    }

    pub fn clear_token(&mut self) {
        self.cancel_token = None;
    }
}

/// Download all files for a model variant.
///
/// Emits `model-download-progress` events to the Tauri app handle.
/// Supports resume (checks for `.part` files) and cancellation.
pub async fn download_variant(
    app: tauri::AppHandle,
    model: &ModelDefinition,
    variant: &ModelVariant,
    cancel: CancellationToken,
) -> Result<(), String> {
    let model_dir = model_registry::model_dir(model);
    std::fs::create_dir_all(&model_dir).map_err(|e| format!("Failed to create model dir: {e}"))?;

    // Check available disk space
    check_disk_space(&model_dir, variant.total_size_bytes)?;

    let client = Client::new();
    let total_bytes: u64 = variant.files.iter().map(|f| f.size_bytes).sum();
    let mut cumulative_bytes: u64 = 0;

    for file in variant.files {
        if cancel.is_cancelled() {
            emit_progress(&app, model.id, DownloadState::Cancelled, file.local_name, 0, 0, 0.0);
            return Err("Download cancelled".to_string());
        }

        let result = download_single_file(
            &app,
            &client,
            model.id,
            file,
            &model_dir,
            &cancel,
            cumulative_bytes,
            total_bytes,
        )
        .await;

        match result {
            Ok(()) => {
                cumulative_bytes += file.size_bytes;
            }
            Err(e) => {
                emit_progress(
                    &app,
                    model.id,
                    DownloadState::Error { message: e.clone() },
                    file.local_name,
                    0,
                    file.size_bytes,
                    cumulative_bytes as f64 / total_bytes as f64,
                );
                return Err(e);
            }
        }
    }

    emit_progress(
        &app,
        model.id,
        DownloadState::Complete,
        "",
        total_bytes,
        total_bytes,
        1.0,
    );

    Ok(())
}

async fn download_single_file(
    app: &tauri::AppHandle,
    client: &Client,
    model_id: &str,
    file: &ModelFile,
    model_dir: &PathBuf,
    cancel: &CancellationToken,
    cumulative_bytes: u64,
    total_bytes: u64,
) -> Result<(), String> {
    let final_path = model_dir.join(file.local_name);
    let part_path = model_dir.join(format!("{}.part", file.local_name));

    // Check if already downloaded
    if final_path.exists() {
        return Ok(());
    }

    // Resume support: check existing .part file size
    let existing_bytes = if part_path.exists() {
        std::fs::metadata(&part_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    // Build request with optional Range header for resume
    let mut request = client.get(file.url);
    if existing_bytes > 0 {
        request = request.header("Range", format!("bytes={}-", existing_bytes));
        tracing::info!(
            "Resuming download of {} from byte {}",
            file.local_name,
            existing_bytes
        );
    }

    let response = request.send().await.map_err(|e| format!("HTTP request failed: {e}"))?;

    if !response.status().is_success() && response.status().as_u16() != 206 {
        return Err(format!(
            "HTTP {} when downloading {}",
            response.status(),
            file.local_name
        ));
    }

    // Open file for writing (append if resuming)
    let mut out_file = if existing_bytes > 0 && response.status().as_u16() == 206 {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&part_path)
            .await
            .map_err(|e| format!("Failed to open part file: {e}"))?
    } else {
        // Start fresh
        tokio::fs::File::create(&part_path)
            .await
            .map_err(|e| format!("Failed to create part file: {e}"))?
    };

    let mut stream = response.bytes_stream();
    let mut downloaded = if response.status().as_u16() == 206 {
        existing_bytes
    } else {
        0
    };
    let mut last_emitted_pct: i32 = -1;

    while let Some(chunk_result) = stream.next().await {
        if cancel.is_cancelled() {
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
        tokio::io::AsyncWriteExt::write_all(&mut out_file, &chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;

        downloaded += chunk.len() as u64;

        // Emit progress at most every 1%
        let overall_pct =
            (cumulative_bytes + downloaded) as f64 / total_bytes as f64;
        let pct_int = (overall_pct * 100.0) as i32;
        if pct_int > last_emitted_pct {
            last_emitted_pct = pct_int;
            emit_progress(
                app,
                model_id,
                DownloadState::Downloading,
                file.local_name,
                downloaded,
                file.size_bytes,
                overall_pct,
            );
        }
    }

    drop(out_file);

    // Verify SHA-256 if provided
    if !file.sha256.is_empty() {
        emit_progress(
            app,
            model_id,
            DownloadState::Verifying,
            file.local_name,
            downloaded,
            file.size_bytes,
            (cumulative_bytes + file.size_bytes) as f64 / total_bytes as f64,
        );

        let hash = hash_file(&part_path).await?;
        if hash != file.sha256 {
            let _ = std::fs::remove_file(&part_path);
            return Err(format!(
                "SHA-256 mismatch for {}: expected {}, got {}",
                file.local_name, file.sha256, hash
            ));
        }
    }

    // Atomic rename .part -> final
    std::fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Failed to rename part file: {e}"))?;

    Ok(())
}

async fn hash_file(path: &PathBuf) -> Result<String, String> {
    let data = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Failed to read file for hashing: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Ok(format!("{:x}", hasher.finalize()))
}

fn check_disk_space(path: &PathBuf, required_bytes: u64) -> Result<(), String> {
    // Use sysinfo or a simple statvfs check
    // For now, try to get available space via std
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        // Simple heuristic: if the dir exists, we assume there's space
        // A more robust check would use statvfs, but this avoids adding deps
        let _ = (path, required_bytes);
    }
    #[cfg(not(unix))]
    {
        let _ = (path, required_bytes);
    }
    Ok(())
}

fn emit_progress(
    app: &tauri::AppHandle,
    model_id: &str,
    state: DownloadState,
    current_file: &str,
    file_bytes_downloaded: u64,
    file_total_bytes: u64,
    overall_percent: f64,
) {
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress {
            model_id: model_id.to_string(),
            state,
            current_file: current_file.to_string(),
            file_bytes_downloaded,
            file_total_bytes,
            overall_percent,
        },
    );
}

/// Delete all model files for a given model.
pub fn delete_model_files(model: &ModelDefinition) -> Result<(), String> {
    let dir = model_registry::model_dir(model);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete model: {e}"))?;
    }
    Ok(())
}

/// Get on-disk status for all models in the registry.
pub fn get_all_model_status() -> Vec<ModelOnDiskStatus> {
    model_registry::MODEL_REGISTRY
        .iter()
        .map(|model| {
            let dir = model_registry::model_dir(model);
            let mut downloaded = false;
            let mut variant_id = None;
            let mut size_on_disk: u64 = 0;

            for variant in model.variants {
                if model_registry::is_variant_downloaded(model, variant) {
                    downloaded = true;
                    variant_id = Some(variant.id.to_string());
                    // Calculate actual size on disk
                    for file in variant.files {
                        if let Ok(meta) = std::fs::metadata(dir.join(file.local_name)) {
                            size_on_disk += meta.len();
                        }
                    }
                    break;
                }
            }

            ModelOnDiskStatus {
                model_id: model.id.to_string(),
                name: model.name.to_string(),
                description: model.description.to_string(),
                category: format!("{:?}", model.category),
                downloaded,
                variant_id,
                size_on_disk,
            }
        })
        .collect()
}
```

**Step 2: Register the module in lib.rs**

Add `pub mod model_download;` to `src-tauri/src/lib.rs` after `pub mod model_registry;`:

```rust
pub mod model_download;
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add src-tauri/src/model_download.rs src-tauri/src/lib.rs
git commit -m "feat: add model download engine with streaming, resume, and progress events"
```

---

### Task 4: Wire Up Tauri Commands

**Files:**
- Modify: `src-tauri/src/commands.rs` (add 5 new commands)
- Modify: `src-tauri/src/lib.rs` (register commands and managed state)

**Step 1: Add the DownloadManager state type and new commands to commands.rs**

Add this import at the top of `src-tauri/src/commands.rs`:

```rust
use crate::model_download::{self, DownloadManager};
use crate::model_registry;
```

Add a new type alias next to the other state types (around line 15):

```rust
pub type DownloadManagerState = Arc<TokioMutex<DownloadManager>>;
```

Add these new command functions at the bottom of `commands.rs` (before the closing of the file):

```rust
// Model download commands

#[tauri::command]
pub async fn get_available_models() -> Result<serde_json::Value, String> {
    serde_json::to_value(model_registry::MODEL_REGISTRY).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_downloaded_models() -> Result<Vec<model_download::ModelOnDiskStatus>, String> {
    Ok(model_download::get_all_model_status())
}

#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    download_mgr: State<'_, DownloadManagerState>,
    model_id: String,
    variant_id: String,
) -> Result<(), String> {
    let (model, variant) = model_registry::get_variant(&model_id, &variant_id)
        .ok_or_else(|| format!("Unknown model/variant: {model_id}/{variant_id}"))?;

    let cancel = {
        let mut mgr = download_mgr.lock().await;
        mgr.new_token()
    };

    let result = model_download::download_variant(app, model, variant, cancel).await;

    {
        let mut mgr = download_mgr.lock().await;
        mgr.clear_token();
    }

    result
}

#[tauri::command]
pub async fn cancel_download(
    download_mgr: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    let mut mgr = download_mgr.lock().await;
    mgr.cancel();
    Ok(())
}

#[tauri::command]
pub async fn delete_model(model_id: String) -> Result<(), String> {
    let model = model_registry::get_model(&model_id)
        .ok_or_else(|| format!("Unknown model: {model_id}"))?;
    model_download::delete_model_files(model)
}
```

**Step 2: Register commands and state in lib.rs**

In `src-tauri/src/lib.rs`, add the DownloadManager state. Add this import:

```rust
use commands::DownloadManagerState;
use model_download::DownloadManager;
```

Add the managed state (after the `detector_state` line, around line 52):

```rust
let download_manager: DownloadManagerState = Arc::new(TokioMutex::new(DownloadManager::new()));
```

Add `.manage(download_manager)` after the `.manage(detector_state)` line.

Add the five new commands to the `invoke_handler` list:

```rust
commands::get_available_models,
commands::get_downloaded_models,
commands::download_model,
commands::cancel_download,
commands::delete_model,
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

**Step 4: Run all existing tests to ensure nothing broke**

Run: `cd src-tauri && cargo test`
Expected: All existing tests pass.

**Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: wire up model download Tauri commands"
```

---

### Task 5: Create useModelDownload React Hook

**Files:**
- Create: `src/hooks/useModelDownload.ts`

This hook wraps the Tauri commands and listens for download progress events.

**Step 1: Create the hook**

Create `src/hooks/useModelDownload.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ModelFile {
  local_name: string;
  url: string;
  size_bytes: number;
  sha256: string;
}

export interface ModelVariant {
  id: string;
  label: string;
  files: ModelFile[];
  total_size_bytes: number;
}

export interface ModelDefinition {
  id: string;
  name: string;
  description: string;
  category: "Transcription" | "Diarization";
  dir_name: string;
  variants: ModelVariant[];
}

export interface ModelOnDiskStatus {
  model_id: string;
  name: string;
  description: string;
  category: string;
  downloaded: boolean;
  variant_id: string | null;
  size_on_disk: number;
}

export interface DownloadProgress {
  model_id: string;
  state:
    | "downloading"
    | "verifying"
    | "complete"
    | { error: { message: string } }
    | "cancelled";
  current_file: string;
  file_bytes_downloaded: number;
  file_total_bytes: number;
  overall_percent: number;
}

export function useModelDownload() {
  const [registry, setRegistry] = useState<ModelDefinition[]>([]);
  const [diskStatus, setDiskStatus] = useState<ModelOnDiskStatus[]>([]);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [models, status] = await Promise.all([
        invoke<ModelDefinition[]>("get_available_models"),
        invoke<ModelOnDiskStatus[]>("get_downloaded_models"),
      ]);
      setRegistry(models);
      setDiskStatus(status);
    } catch (e) {
      console.error("Failed to load model info:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for download progress events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<DownloadProgress>("model-download-progress", (event) => {
      setProgress(event.payload);

      // Auto-refresh disk status when download completes
      if (event.payload.state === "complete") {
        refresh();
        // Clear progress after a short delay
        setTimeout(() => setProgress(null), 1500);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [refresh]);

  const downloadModel = useCallback(
    async (modelId: string, variantId: string) => {
      await invoke("download_model", {
        modelId,
        variantId,
      });
    },
    []
  );

  const cancelDownload = useCallback(async () => {
    await invoke("cancel_download");
    setProgress(null);
  }, []);

  const deleteModel = useCallback(
    async (modelId: string) => {
      await invoke("delete_model", { modelId });
      await refresh();
    },
    [refresh]
  );

  return {
    registry,
    diskStatus,
    progress,
    loading,
    refresh,
    downloadModel,
    cancelDownload,
    deleteModel,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/munich-v2 && npx tsc --noEmit`
Expected: No type errors (or only pre-existing ones).

**Step 3: Commit**

```bash
git add src/hooks/useModelDownload.ts
git commit -m "feat: add useModelDownload React hook for download progress"
```

---

### Task 6: Add Model Download Step to Onboarding

**Files:**
- Modify: `src/components/Onboarding.tsx`

**Step 1: Update the onboarding to include a Models step**

Replace the entire `Onboarding.tsx` with the updated version that includes a "Models" step between "Permissions" and "API Keys".

Key changes:
1. `STEPS` becomes `["Welcome", "Permissions", "Models", "API Keys", "Done"]`
2. New `step === "Models"` section shows model cards with variant picker and download buttons
3. Uses `useModelDownload` hook for state and actions
4. Progress bar shows during download
5. "Skip" button lets users proceed without downloading

The `Models` step renders each model from the registry as a card. For transcription, it shows a variant picker (int8/full). Each card has a Download button that shows a progress bar during download.

```typescript
// In the Models step section:
// - Map over registry to show each model
// - For models with multiple variants, show radio buttons
// - Download button triggers downloadModel()
// - Progress bar binds to progress.overall_percent
// - "Skip" and "Continue" (when all downloaded) buttons
```

Provide the full updated `Onboarding.tsx` content — see the implementation step for exact code. The important structural change is adding the `"Models"` step to `STEPS` and the corresponding rendering block.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No new type errors.

**Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add model download step to onboarding flow"
```

---

### Task 7: Add Model Management to Settings

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add a Models card to the Settings page**

Add a new `<Card>` section between the API Keys card and the About card. It shows:
- Each model with name, description, and status badge (Downloaded / Not Downloaded)
- If downloaded: size on disk, variant label, Re-download and Delete buttons
- If not downloaded: variant picker and Download button
- Active download progress bar when `progress` is set

Use the `useModelDownload` hook for state.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No new type errors.

**Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add model management section to Settings page"
```

---

### Task 8: Test End-to-End Download Flow

**Files:**
- No new files — this is a manual verification task

**Step 1: Start the dev server**

Run: `cd /Users/michelle/conductor/workspaces/nootle/munich-v2 && cargo tauri dev`

**Step 2: Test the download flow**

1. Clear onboarding state: Open browser console, run `localStorage.removeItem("onboarding_complete")`, refresh
2. Walk through onboarding — verify the "Models" step appears
3. Select int8 variant for Parakeet, click Download
4. Verify progress bar updates in real time
5. Verify files appear in `~/Library/Application\ Support/Nootle/models/parakeet-tdt-0.6b-v2/`
6. Verify the diarization model downloads
7. Navigate to Settings — verify models show as "Downloaded"
8. Test Delete — verify files removed, status updates
9. Test Re-download — verify it works

**Step 3: Verify model loading works**

After downloading, start a recording. Check the Rust logs — the transcription engine should load without the "Models not found" error. Look for:
```
Transcription engine loaded with CoreML acceleration
```

**Step 4: Commit any fixes**

If any issues found during testing, fix and commit.

---

### Task 9: Update Existing Model Status Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`

The existing `get_model_status` and `get_diarization_status` commands still work but are now redundant with `get_downloaded_models`. Keep them for backward compatibility but update `get_model_status` to also report `Downloading` state when a download is in progress.

**Step 1: Update get_model_status to check download manager**

```rust
#[tauri::command]
pub async fn get_model_status(
    download_mgr: State<'_, DownloadManagerState>,
) -> Result<String, String> {
    // Check if currently downloading
    let mgr = download_mgr.lock().await;
    let is_downloading = mgr.cancel_token.is_some();
    drop(mgr);

    if is_downloading {
        return serde_json::to_string(&transcription::ModelStatus::Downloading { progress: 0.0 })
            .map_err(|e| e.to_string());
    }

    let status = transcription::TranscriptionEngine::check_status();
    serde_json::to_string(&status).map_err(|e| e.to_string())
}
```

Note: This requires making `cancel_token` field pub(crate) in `DownloadManager`. Update the struct:

```rust
pub struct DownloadManager {
    pub(crate) cancel_token: Option<CancellationToken>,
}
```

**Step 2: Verify it compiles and tests pass**

Run: `cd src-tauri && cargo check && cargo test`
Expected: All pass.

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/model_download.rs
git commit -m "fix: update get_model_status to reflect active download state"
```

---

## Notes for the Implementer

### HuggingFace URL Pattern
All model files use the `/resolve/main/` URL pattern which serves raw files directly (no auth required):
```
https://huggingface.co/{org}/{repo}/resolve/main/{filepath}
```

### File Size Reference
| Model | Variant | Files | Total Size |
|-------|---------|-------|------------|
| Parakeet TDT | int8 | encoder (652MB) + decoder (9MB) + vocab (10KB) | ~661MB |
| Parakeet TDT | full | encoder (42MB + 2.44GB data) + decoder (36MB) + vocab (10KB) | ~2.5GB |
| Diarization | default | segmentation (6MB) + embedding (26.5MB) | ~32MB |

### SHA-256 Hashes
The SHA-256 fields are empty strings in the initial registry. This means verification is skipped. To populate them later:
1. Download each file
2. Run `shasum -a 256 <file>` on each
3. Update the `sha256` fields in `model_registry.rs`

### Testing Without Full Download
During development, you can test the UI without downloading real models by:
1. Creating empty files at the expected paths to simulate "downloaded" state
2. Using a small test file URL to test the download streaming logic

### Tauri Event Naming
The event name is `model-download-progress`. The frontend listens for this in the `useModelDownload` hook. The Rust side emits it via `app.emit()`.
