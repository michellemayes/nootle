# Parakeet v3 Upgrade Design

## Goal

Upgrade the transcription model from Parakeet TDT 0.6B v2 to v3. Keep English-only for now; v3 brings improved accuracy. Include the new `nemo128.onnx` file.

## Changes

### model_registry.rs

- Model ID: `parakeet-tdt-0.6b-v2` → `parakeet-tdt-0.6b-v3`
- Name/description updated to v3
- All HuggingFace URLs: `istupakov/parakeet-tdt-0.6b-v2-onnx` → `istupakov/parakeet-tdt-0.6b-v3-onnx`
- Dir name: `parakeet-tdt-0.6b-v3` (new directory; old v2 data won't conflict)
- Updated file sizes:
  - decoder (full): 35.8 MB → 72.5 MB
  - decoder (INT8): 9 MB → 18.2 MB
  - vocab: 10 KB → 94 KB
- Added `nemo128.onnx` (140 KB) to both INT8 and full variants
- Updated `total_size_bytes` for both variants
- All tests updated

### transcription.rs

- `MODEL_DIR_NAME` → `"parakeet-tdt-0.6b-v3"`
- Fixed vocab parsing: v2 and v3 both use `token ID` pairs per line, but the old code read each full line as the token. Now parses out just the token text.
- Updated special-token filtering: v3 uses `<pad>`, `<unk>`, and tokens starting with `<|` as control tokens, replacing the old `<blank>`/`<pad>` checks.

### Frontend

No changes needed. The frontend receives model definitions from the Rust backend.

## File sizes (v3 ONNX repo)

| File | Size |
|------|------|
| encoder-model.onnx | 41.8 MB |
| encoder-model.onnx.data | 2.44 GB |
| encoder-model.int8.onnx | 652 MB |
| decoder_joint-model.onnx | 72.5 MB |
| decoder_joint-model.int8.onnx | 18.2 MB |
| vocab.txt | 93.9 KB |
| nemo128.onnx | 140 KB |

## Migration

Users with v2 downloaded will see the model as "not downloaded" and need to re-download. The v2 files remain on disk in `parakeet-tdt-0.6b-v2/` but are unused. No automatic cleanup.
