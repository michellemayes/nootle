# Local Model Download System

## Problem

Nootle references Parakeet TDT and diarization ONNX models but has no mechanism to download them. The code has a `ModelStatus::Downloading` variant that is never used. Users must manually place model files in `~/Library/Application Support/Nootle/models/`. Without models, transcription and diarization silently skip.

## Decision

Rust-native downloader using `reqwest` streaming, with progress pushed to the frontend via Tauri events. Models downloaded from HuggingFace Hub (no auth required). User chooses quality variant during onboarding; can manage models from Settings.

## Model Registry

A compile-time registry defines available models, their files, URLs, sizes, and SHA-256 hashes.

### Models

**Transcription (Parakeet TDT 0.6B v2)**
- Source: `istupakov/parakeet-tdt-0.6b-v2-onnx` on HuggingFace
- Files: `encoder-model.onnx` (or int8 variant), `decoder_joint-model.onnx` (or int8), `vocab.txt`
- int8 variant: ~661MB total
- Full precision variant: ~2.48GB total

**Diarization (Segmentation + Speaker Embedding)**
- Segmentation: pyannote-segmentation-3.0 ONNX
- Embedding: wespeaker-voxceleb-resnet34 ONNX
- Small models, ~50MB total

### Registry Structure

```rust
struct ModelFile {
    filename: &'static str,
    url: &'static str,
    size_bytes: u64,
    sha256: &'static str,
}

struct ModelVariant {
    id: &'static str,
    label: &'static str,
    files: &'static [ModelFile],
    total_size_bytes: u64,
}

struct ModelDefinition {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    category: ModelCategory,
    dir_name: &'static str,
    variants: &'static [ModelVariant],
}
```

Extensible: add a new `ModelDefinition` entry to support future models.

## Download Engine

New file: `src-tauri/src/model_download.rs`

### Behavior

1. Download files sequentially via `reqwest` streaming to `.part` temp files
2. Emit Tauri events (`model-download-progress`) with per-file and overall progress
3. Verify SHA-256 hash after each file completes
4. Rename `.part` to final filename atomically
5. Support cancellation via `tokio_util::sync::CancellationToken`
6. Support resume via HTTP `Range` header when `.part` file exists

### Tauri Commands

- `download_model(model_id, variant_id)` - starts download, progress via events
- `cancel_download()` - cancels active download
- `delete_model(model_id)` - removes downloaded files
- `get_available_models()` - returns registry as JSON
- `get_downloaded_models()` - returns status of each model on disk

### Event Payload

```json
{
  "model_id": "parakeet-tdt-0.6b-v2",
  "state": "downloading",
  "current_file": "encoder-model.int8.onnx",
  "file_bytes_downloaded": 123456789,
  "file_total_bytes": 652000000,
  "overall_percent": 0.45
}
```

States: `downloading`, `verifying`, `complete`, `error`, `cancelled`.

## Frontend Integration

### Onboarding

Add a "Download Models" step between permissions and API key setup:

1. Show transcription and diarization as two model categories
2. For transcription, show int8 vs full-precision variant picker with size labels
3. Download button with progress bar (per-file and overall)
4. "Skip" option (recording works without models)
5. Proceed when all selected models finish

### Settings Page

Add a "Models" section:

- Each model shows: name, status (Downloaded/Not Downloaded), size on disk
- Download / Re-download / Delete buttons
- Variant switcher for transcription model
- Active download progress when downloading

### Recording Flow

No changes. Existing graceful degradation preserved: if models missing, transcription is skipped with a log warning.

## Error Handling

| Scenario | Handling |
|----------|----------|
| Network failure | Preserve `.part` file, show error with Retry button, resume on retry |
| Insufficient disk space | Check before starting, warn if < 2x download size |
| Corrupt download | SHA-256 mismatch deletes file, prompts re-download |
| App quit during download | `.part` file stays; detect and offer resume on next launch |
| Models deleted externally | `check_status()` returns `NotDownloaded` |
| HuggingFace unreachable | Show error with URL for manual download |

## File Mapping

The HuggingFace repo uses different filenames than the current code expects. The download engine renames files during placement:

| HuggingFace file | Local filename | Notes |
|------------------|---------------|-------|
| `encoder-model.int8.onnx` | `encoder.onnx` | int8 variant |
| `encoder-model.onnx` + `encoder-model.onnx.data` | `encoder.onnx` | full precision (external data) |
| `decoder_joint-model.int8.onnx` | `decoder.onnx` | int8 variant |
| `decoder_joint-model.onnx` | `decoder.onnx` | full precision |
| `vocab.txt` | `vocab.txt` | same name |

## Existing Code Changes

- `transcription.rs`: Update `MODEL_DIR_NAME` and file expectations if needed after testing actual model compatibility with current inference code
- `commands.rs`: Wire up new download commands, add `download_model` etc. to Tauri command list
- `lib.rs`: Register new commands in Tauri builder
- `Cargo.toml`: Add `sha2` crate for hash verification, `tokio-util` for cancellation token
- `Onboarding.tsx`: Add model download step
- `Settings.tsx`: Add model management section
