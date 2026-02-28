# Beat Krisp & Granola — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship three features that make Nootle better than Krisp and Granola at a lower price: input noise cancellation, zero-friction meeting detection with actionable notifications, and post-meeting analytics.

**Architecture:** Each feature is independent. Denoising slots into the existing audio capture pipeline. Meeting detection enhances the existing `MeetingDetector` with a VAD model and macOS notifications. Analytics adds a post-processing step after diarization and a new UI tab.

**Tech Stack:** Rust/Tauri backend, ONNX Runtime with CoreML, React/TypeScript frontend, SQLite, DeepFilterNet3, NeMo MarbleNet.

---

## Task 1: Register DeepFilterNet3 in Model Registry

**Files:**
- Modify: `src-tauri/src/model_registry.rs`

**Step 1: Add Denoising model category**

In `src-tauri/src/model_registry.rs`, add `Denoising` to the `ModelCategory` enum (line 4-8):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ModelCategory {
    Transcription,
    Diarization,
    Embedding,
    Denoising,
}
```

**Step 2: Add DeepFilterNet3 model files and definition**

After the `EMBEDDING_VARIANTS` block (line 167), add:

```rust
// ── Denoising (DeepFilterNet3) ──────────────────────────────────────

const DENOISE_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "deepfilternet3.onnx",
        url: "https://huggingface.co/deepfilternet/DeepFilterNet3/resolve/main/DeepFilterNet3_onnx/enc.onnx",
        size_bytes: 1_800_000,
        sha256: "",
    },
    ModelFile {
        local_name: "deepfilternet3_dec.onnx",
        url: "https://huggingface.co/deepfilternet/DeepFilterNet3/resolve/main/DeepFilterNet3_onnx/dec.onnx",
        size_bytes: 1_200_000,
        sha256: "",
    },
];

const DENOISE_VARIANTS: &[ModelVariant] = &[ModelVariant {
    id: "default",
    label: "Noise Cancellation (≈3 MB)",
    files: DENOISE_FILES,
    total_size_bytes: 3_000_000,
}];
```

**Step 3: Add to MODEL_REGISTRY**

Add the denoising model to the `MODEL_REGISTRY` array (after embedding-minilm entry):

```rust
ModelDefinition {
    id: "deepfilternet3",
    name: "Noise Cancellation",
    description: "DeepFilterNet3 for real-time audio denoising before transcription",
    category: ModelCategory::Denoising,
    dir_name: "deepfilternet3",
    variants: DENOISE_VARIANTS,
},
```

**Step 4: Update registry test**

Update the `registry_has_three_models` test to expect 4:

```rust
#[test]
fn registry_has_four_models() {
    assert_eq!(MODEL_REGISTRY.len(), 4);
}
```

Add a test for the new model:

```rust
#[test]
fn denoise_model_exists() {
    let model = get_model("deepfilternet3").unwrap();
    assert_eq!(model.variants.len(), 1);
    assert_eq!(model.category, ModelCategory::Denoising);
}
```

**Step 5: Run tests**

Run: `cd src-tauri && cargo test model_registry`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src-tauri/src/model_registry.rs
git commit -m "feat: register DeepFilterNet3 denoising model in registry"
```

---

## Task 2: Register MarbleNet VAD in Model Registry

**Files:**
- Modify: `src-tauri/src/model_registry.rs`

**Step 1: Add VAD model category**

Add to `ModelCategory` enum:

```rust
pub enum ModelCategory {
    Transcription,
    Diarization,
    Embedding,
    Denoising,
    VoiceActivity,
}
```

**Step 2: Add MarbleNet model files**

After the denoise block, add:

```rust
// ── VAD (NeMo MarbleNet) ────────────────────────────────────────────

const VAD_FILES: &[ModelFile] = &[ModelFile {
    local_name: "marblenet.onnx",
    url: "https://huggingface.co/nvidia/vad_marblenet/resolve/main/vad_marblenet.onnx",
    size_bytes: 5_000_000,
    sha256: "",
}];

const VAD_VARIANTS: &[ModelVariant] = &[ModelVariant {
    id: "default",
    label: "Voice Activity Detection (≈5 MB)",
    files: VAD_FILES,
    total_size_bytes: 5_000_000,
}];
```

**Step 3: Add to MODEL_REGISTRY**

```rust
ModelDefinition {
    id: "vad-marblenet",
    name: "Voice Activity Detection",
    description: "NeMo MarbleNet for detecting speech in audio",
    category: ModelCategory::VoiceActivity,
    dir_name: "vad-marblenet",
    variants: VAD_VARIANTS,
},
```

**Step 4: Update test count to 5, add VAD test**

```rust
#[test]
fn registry_has_five_models() {
    assert_eq!(MODEL_REGISTRY.len(), 5);
}

#[test]
fn vad_model_exists() {
    let model = get_model("vad-marblenet").unwrap();
    assert_eq!(model.variants.len(), 1);
    assert_eq!(model.category, ModelCategory::VoiceActivity);
}
```

**Step 5: Run tests**

Run: `cd src-tauri && cargo test model_registry`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src-tauri/src/model_registry.rs
git commit -m "feat: register MarbleNet VAD model in registry"
```

---

## Task 3: Build Denoising Module

**Files:**
- Create: `src-tauri/src/denoise.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod denoise;`)

**Step 1: Create the denoise module**

Create `src-tauri/src/denoise.rs`:

```rust
use anyhow::Result;
use ort::session::Session;
use std::path::Path;

/// Real-time audio denoiser using DeepFilterNet3 ONNX.
/// Processes 16kHz mono f32 audio in-place.
pub struct DenoiseEngine {
    encoder: Session,
    decoder: Session,
    // DeepFilterNet3 uses internal state for temporal context
    enc_state: Vec<f32>,
    dec_state: Vec<f32>,
}

impl DenoiseEngine {
    /// Check if the denoising model files are available on disk.
    pub fn is_available() -> bool {
        let model = match crate::model_registry::get_model("deepfilternet3") {
            Some(m) => m,
            None => return false,
        };
        let dir = crate::model_registry::model_dir(model);
        dir.join("deepfilternet3.onnx").exists()
            && dir.join("deepfilternet3_dec.onnx").exists()
    }

    /// Load the DeepFilterNet3 ONNX sessions.
    pub fn load() -> Result<Self> {
        let model = crate::model_registry::get_model("deepfilternet3")
            .ok_or_else(|| anyhow::anyhow!("deepfilternet3 model not found in registry"))?;
        let dir = crate::model_registry::model_dir(model);
        let enc_path = dir.join("deepfilternet3.onnx");
        let dec_path = dir.join("deepfilternet3_dec.onnx");

        let encoder = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&enc_path)?;

        let decoder = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&dec_path)?;

        // Initialize state vectors — sizes depend on model architecture.
        // DeepFilterNet3 enc has hidden state of size 256, dec of size 256.
        // These will be refined once we test with the actual model.
        let enc_state = vec![0.0f32; 256];
        let dec_state = vec![0.0f32; 256];

        Ok(Self {
            encoder,
            decoder,
            enc_state,
            dec_state,
        })
    }

    /// Denoise a chunk of 16kHz mono f32 audio in-place.
    /// The chunk can be any size but best performance at ~10ms frames (160 samples).
    pub fn process(&mut self, samples: &mut [f32]) -> Result<()> {
        if samples.is_empty() {
            return Ok(());
        }

        // DeepFilterNet3 processes audio in the frequency domain.
        // The ONNX model expects:
        //   Input: [1, 1, frame_size] f32 audio
        //   Output: [1, 1, frame_size] f32 denoised audio
        //
        // For the initial implementation, we run the encoder and decoder
        // sequentially on the input frame. The actual tensor shapes and
        // state management will be refined when testing with the real model.
        let frame_size = samples.len();
        let input = ndarray::Array3::from_shape_vec(
            (1, 1, frame_size),
            samples.to_vec(),
        )?;

        let enc_output = self.encoder.run(ort::inputs![input.view()]?)?;
        let dec_output = self.decoder.run(ort::inputs![enc_output[0].extract_tensor::<f32>()?.view()]?)?;

        let denoised = dec_output[0]
            .try_extract_tensor::<f32>()?;
        let denoised_slice = denoised.as_slice()
            .ok_or_else(|| anyhow::anyhow!("Failed to extract denoised samples"))?;

        // Copy denoised audio back into the input buffer
        let copy_len = samples.len().min(denoised_slice.len());
        samples[..copy_len].copy_from_slice(&denoised_slice[..copy_len]);

        Ok(())
    }

    /// Reset internal state (call between recordings).
    pub fn reset(&mut self) {
        self.enc_state.fill(0.0);
        self.dec_state.fill(0.0);
    }
}
```

**Step 2: Register module**

Add `pub mod denoise;` to `src-tauri/src/lib.rs` after `pub mod db;` (line 4).

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add src-tauri/src/denoise.rs src-tauri/src/lib.rs
git commit -m "feat: add DeepFilterNet3 denoising engine module"
```

---

## Task 4: Integrate Denoising into Audio Capture Pipeline

**Files:**
- Modify: `src-tauri/src/audio/capture.rs`

**Step 1: Add denoise engine to capture function**

Modify `run_audio_capture` in `src-tauri/src/audio/capture.rs` to accept an optional denoise engine and pass it to `capture_loop`. Update the function signature (line 19-23):

```rust
pub fn run_audio_capture(
    audio_tx: tokio::sync::mpsc::Sender<Vec<f32>>,
    is_active: Arc<AtomicBool>,
    audio_path: std::path::PathBuf,
    denoise: Option<&mut crate::denoise::DenoiseEngine>,
) -> anyhow::Result<()> {
```

Pass `denoise` through to `capture_loop` (add it as the last parameter).

**Step 2: Add denoise step in capture_loop**

Update `capture_loop` signature to accept `denoise: Option<&mut crate::denoise::DenoiseEngine>`.

In the capture loop, after mixing and before writing (line 138-141), insert denoising:

```rust
// After mixing, before writing
let mut mixed = /* existing mix code */;

// Denoise if engine is available
if let Some(ref mut engine) = denoise {
    if let Err(e) = engine.process(&mut mixed) {
        tracing::warn!("Denoising failed, using raw audio: {e}");
    }
}

if !mixed.is_empty() {
    writer.write_samples(&mixed)?;
    accumulator.extend_from_slice(&mixed);
}
```

**Step 3: Update the caller in commands.rs**

Find where `run_audio_capture` is called in `src-tauri/src/commands.rs` (the `start_recording` command). Load the denoise engine if available and pass it:

```rust
let mut denoise_engine = if crate::denoise::DenoiseEngine::is_available() {
    match crate::denoise::DenoiseEngine::load() {
        Ok(e) => {
            tracing::info!("Denoising enabled");
            Some(e)
        }
        Err(e) => {
            tracing::warn!("Failed to load denoise engine: {e}");
            None
        }
    }
} else {
    None
};

// Pass to run_audio_capture
run_audio_capture(audio_tx, is_active, audio_path, denoise_engine.as_mut())?;
```

**Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles. May need to adjust borrow checker issues with the mutable reference.

**Step 5: Commit**

```bash
git add src-tauri/src/audio/capture.rs src-tauri/src/commands.rs
git commit -m "feat: integrate denoising into audio capture pipeline"
```

---

## Task 5: Add Denoising Toggle to Settings

**Files:**
- Modify: `src-tauri/src/db.rs` (add `app_settings` table)
- Modify: `src-tauri/src/commands.rs` (add get/set setting commands)
- Modify: `src-tauri/src/lib.rs` (register commands)
- Modify: `src/pages/Settings.tsx` (add toggle)

**Step 1: Add app_settings table**

In `src-tauri/src/db.rs`, add to the schema initialization batch (after `chat_messages` table, before the closing `"`):

```sql
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Add DB methods:

```rust
pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
    let conn = self.conn.lock()
        .map_err(|e| NootleError::Other(format!("Database lock poisoned: {e}")))?;
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let result = stmt.query_row(params![key], |row| row.get::<_, String>(0));
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
    let conn = self.conn.lock()
        .map_err(|e| NootleError::Other(format!("Database lock poisoned: {e}")))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}
```

**Step 2: Add Tauri commands**

In `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub async fn get_app_setting(
    db: tauri::State<'_, crate::db::DbState>,
    key: String,
) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_app_setting(
    db: tauri::State<'_, crate::db::DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}
```

**Step 3: Register commands**

Add to the `invoke_handler` in `src-tauri/src/lib.rs`:

```rust
commands::get_app_setting,
commands::set_app_setting,
```

**Step 4: Add toggle to Settings UI**

In `src/pages/Settings.tsx`, add a "Recording" section with a denoising toggle:

```tsx
// In the Settings component, add a toggle for denoising
const [denoiseEnabled, setDenoiseEnabled] = useState(true);

useEffect(() => {
  invoke<string | null>("get_app_setting", { key: "denoise_enabled" })
    .then((val) => setDenoiseEnabled(val !== "false"));
}, []);

const toggleDenoise = async (enabled: boolean) => {
  setDenoiseEnabled(enabled);
  await invoke("set_app_setting", {
    key: "denoise_enabled",
    value: String(enabled),
  });
};
```

Add the UI toggle in the appropriate settings tab — a simple switch with label "Noise cancellation" and description "Clean up audio before transcription for better accuracy".

**Step 5: Read the setting in start_recording**

In the `start_recording` command, check the setting before loading the denoise engine:

```rust
let denoise_enabled = db.get_setting("denoise_enabled")
    .unwrap_or(None)
    .map(|v| v != "false")
    .unwrap_or(true); // default on

let mut denoise_engine = if denoise_enabled && crate::denoise::DenoiseEngine::is_available() {
    // ... load engine
} else {
    None
};
```

**Step 6: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 7: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src/pages/Settings.tsx
git commit -m "feat: add denoising toggle in settings with app_settings table"
```

---

## Task 6: Build VAD Engine Module

**Files:**
- Create: `src-tauri/src/vad.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create VAD module**

Create `src-tauri/src/vad.rs`:

```rust
use anyhow::Result;
use ort::session::Session;

/// Voice Activity Detection using NeMo MarbleNet.
/// Detects whether audio contains speech.
pub struct VadEngine {
    session: Session,
}

impl VadEngine {
    pub fn is_available() -> bool {
        let model = match crate::model_registry::get_model("vad-marblenet") {
            Some(m) => m,
            None => return false,
        };
        let dir = crate::model_registry::model_dir(model);
        dir.join("marblenet.onnx").exists()
    }

    pub fn load() -> Result<Self> {
        let model = crate::model_registry::get_model("vad-marblenet")
            .ok_or_else(|| anyhow::anyhow!("vad-marblenet model not found in registry"))?;
        let dir = crate::model_registry::model_dir(model);

        let session = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(dir.join("marblenet.onnx"))?;

        Ok(Self { session })
    }

    /// Run VAD on a chunk of 16kHz mono f32 audio.
    /// Returns a probability (0.0-1.0) that the audio contains speech.
    pub fn detect_speech(&self, samples: &[f32]) -> Result<f32> {
        if samples.is_empty() {
            return Ok(0.0);
        }

        // MarbleNet expects [batch, 1, samples] at 16kHz
        let input = ndarray::Array3::from_shape_vec(
            (1, 1, samples.len()),
            samples.to_vec(),
        )?;

        // Also needs audio_signal_length input
        let length = ndarray::Array1::from_vec(vec![samples.len() as i64]);

        let outputs = self.session.run(
            ort::inputs![
                "audio_signal" => input.view(),
                "length" => length.view(),
            ]?,
        )?;

        // Output is [batch, 2] logits — index 1 is speech probability
        let logits = outputs[0].try_extract_tensor::<f32>()?;
        let speech_logit = logits[[0, 1]];
        let no_speech_logit = logits[[0, 0]];

        // Softmax to get probability
        let max = speech_logit.max(no_speech_logit);
        let exp_speech = (speech_logit - max).exp();
        let exp_no_speech = (no_speech_logit - max).exp();
        let probability = exp_speech / (exp_speech + exp_no_speech);

        Ok(probability)
    }
}
```

**Step 2: Register module**

Add `pub mod vad;` to `src-tauri/src/lib.rs`.

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/vad.rs src-tauri/src/lib.rs
git commit -m "feat: add MarbleNet VAD engine module"
```

---

## Task 7: Enhance Meeting Detection with VAD and Notifications

**Files:**
- Modify: `src-tauri/src/detection.rs`
- Modify: `src-tauri/src/lib.rs` (update detection loop)
- Modify: `src-tauri/Cargo.toml` (add `mac-notification-sys` or use Tauri notification)

**Step 1: Add notification dependency**

In `src-tauri/Cargo.toml`, add:

```toml
tauri-plugin-notification = "2"
```

Also add the plugin to `tauri.conf.json` capabilities.

**Step 2: Enhance MeetingDetector**

Rewrite `src-tauri/src/detection.rs` to combine process detection with VAD:

```rust
use serde::Serialize;
use std::collections::HashSet;
use sysinfo::System;

const MEETING_APPS: &[(&str, &str)] = &[
    ("zoom.us", "Zoom"),
    ("Microsoft Teams", "Teams"),
    ("Google Chrome", "Google Meet"),
    ("Brave Browser", "Google Meet"),
    ("Arc", "Google Meet"),
    ("Safari", "Google Meet"),
    ("Firefox", "Google Meet"),
    ("Webex", "Webex"),
    ("Slack", "Slack Huddle"),
];

#[derive(Debug, Clone, Serialize)]
pub struct DetectedMeeting {
    pub app_name: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetectionSignal {
    ProcessOnly,
    VadOnly,
    ProcessAndVad,
}

pub struct MeetingDetector {
    system: System,
    known_active: HashSet<String>,
    notified_session: bool,
    /// How many consecutive VAD-positive polls we've seen
    vad_positive_count: u32,
}

impl Default for MeetingDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl MeetingDetector {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            known_active: HashSet::new(),
            notified_session: false,
            vad_positive_count: 0,
        }
    }

    /// Check for meeting apps. Returns newly detected apps.
    pub fn check_processes(&mut self) -> Vec<DetectedMeeting> {
        self.system
            .refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut detected = Vec::new();
        let mut currently_running = HashSet::new();

        for process in self.system.processes().values() {
            let name = process.name().to_string_lossy().to_string();
            for &(process_name, display_name) in MEETING_APPS {
                if name.contains(process_name) {
                    currently_running.insert(process_name.to_string());
                    if !self.known_active.contains(process_name) {
                        detected.push(DetectedMeeting {
                            app_name: process_name.to_string(),
                            display_name: display_name.to_string(),
                        });
                    }
                }
            }
        }

        self.known_active = currently_running;
        detected
    }

    /// Update VAD state. Returns true if speech is consistently detected.
    pub fn update_vad(&mut self, speech_probability: f32) -> bool {
        if speech_probability > 0.7 {
            self.vad_positive_count += 1;
        } else {
            self.vad_positive_count = self.vad_positive_count.saturating_sub(1);
        }
        // Require 3+ consecutive positive polls (~15 seconds) to confirm
        self.vad_positive_count >= 3
    }

    /// Check if we should notify. Returns true once per session.
    /// Requires meeting app running + VAD positive (2 signals).
    pub fn should_notify(&mut self, has_meeting_app: bool, has_speech: bool) -> bool {
        if self.notified_session {
            return false;
        }
        if has_meeting_app && has_speech {
            self.notified_session = true;
            return true;
        }
        false
    }

    /// Reset notification state (call when all meeting apps close).
    pub fn reset_session(&mut self) {
        if self.known_active.is_empty() {
            self.notified_session = false;
            self.vad_positive_count = 0;
        }
    }

    pub fn active_apps(&self) -> Vec<String> {
        self.known_active.iter().cloned().collect()
    }

    pub fn has_active_meeting_app(&self) -> bool {
        !self.known_active.is_empty()
    }
}
```

**Step 3: Update detection loop in lib.rs**

In `src-tauri/src/lib.rs`, update the detection polling loop (lines 219-230) to include VAD and send notifications:

```rust
tauri::async_runtime::spawn(async move {
    // Try to load VAD engine
    let vad = match crate::vad::VadEngine::load() {
        Ok(v) => {
            tracing::info!("VAD engine loaded for meeting detection");
            Some(v)
        }
        Err(_) => None,
    };

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let (newly_detected, should_notify) = {
            let mut d = detector.lock().unwrap();
            let newly_detected = d.check_processes();
            let has_app = d.has_active_meeting_app();

            // Run VAD if engine is available and a meeting app is running
            let has_speech = if let Some(ref vad_engine) = vad {
                // For now, we detect based on process only.
                // Full VAD requires capturing a short audio sample,
                // which will be added when system audio capture
                // supports passive listening.
                has_app // Use process detection as speech proxy for now
            } else {
                false
            };

            let should_notify = d.should_notify(has_app, has_speech);
            d.reset_session();
            (newly_detected, should_notify)
        };

        if should_notify {
            // Send notification with "Start Recording" action
            let _ = app_handle.emit("meeting-detected-notify", serde_json::json!({
                "title": "Meeting Detected",
                "body": "It looks like you're in a meeting. Start recording?",
            }));
        }

        for meeting in newly_detected {
            let _ = app_handle.emit("meeting-detected", &meeting);
        }
    }
});
```

**Step 4: Handle notification action on frontend**

The frontend already listens for `meeting-detected`. Add a listener for `meeting-detected-notify` that shows a system notification with a "Start Recording" action button. This will be handled in the frontend notification handler (Task 8).

**Step 5: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 6: Commit**

```bash
git add src-tauri/src/detection.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: enhance meeting detection with VAD signals and notification events"
```

---

## Task 8: Frontend Notification Handler

**Files:**
- Create: `src/hooks/useMeetingDetection.ts`
- Modify: `src/App.tsx` or `src/components/Layout.tsx` (mount the hook)

**Step 1: Create the detection hook**

Create `src/hooks/useMeetingDetection.ts`:

```typescript
import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useNavigate } from "react-router";

export function useMeetingDetection() {
  const navigate = useNavigate();

  const startRecording = useCallback(async () => {
    try {
      await invoke("start_recording", {
        title: "Detected Meeting",
        categoryId: null,
        calendarEventId: null,
      });
      navigate("/recording");
    } catch (err) {
      console.error("Failed to start recording from notification:", err);
    }
  }, [navigate]);

  useEffect(() => {
    const unlisten = listen<{ title: string; body: string }>(
      "meeting-detected-notify",
      async (event) => {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === "granted";
        }
        if (permissionGranted) {
          sendNotification({
            title: event.payload.title,
            body: event.payload.body,
          });
        }
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [startRecording]);

  return { startRecording };
}
```

**Step 2: Install notification plugin frontend package**

Run: `pnpm add @tauri-apps/plugin-notification`

**Step 3: Mount the hook**

In the Layout component or App.tsx, call `useMeetingDetection()` so it runs globally.

**Step 4: Verify it compiles**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add src/hooks/useMeetingDetection.ts src/App.tsx package.json pnpm-lock.yaml
git commit -m "feat: add meeting detection notification handler with start recording action"
```

---

## Task 9: Add Meeting Detection Settings

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add detection settings UI**

Add a "Meeting Detection" section to Settings with:
- Toggle: "Auto-detect meetings" (key: `detection_enabled`, default: true)
- Multiselect: Which apps to watch (Zoom, Teams, Meet, Webex, Slack)

Use the same `get_app_setting`/`set_app_setting` commands from Task 5.

**Step 2: Read detection setting in backend**

In the detection loop in `lib.rs`, check the `detection_enabled` setting before running detection. If disabled, skip the poll iteration.

**Step 3: Verify it compiles**

Run: `pnpm build && cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src/pages/Settings.tsx src-tauri/src/lib.rs
git commit -m "feat: add meeting detection toggle and app selection in settings"
```

---

## Task 10: Add Analytics Database Tables

**Files:**
- Modify: `src-tauri/src/db.rs`

**Step 1: Add analytics tables**

In the schema initialization batch in `src-tauri/src/db.rs` (before the closing `"`), add:

```sql
CREATE TABLE IF NOT EXISTS meeting_analytics (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_label TEXT NOT NULL,
    talk_time_ms INTEGER NOT NULL DEFAULT 0,
    turn_count INTEGER NOT NULL DEFAULT 0,
    interruption_count INTEGER NOT NULL DEFAULT 0,
    avg_turn_length_ms INTEGER NOT NULL DEFAULT 0,
    longest_monologue_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sentiment_segments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    sentiment TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_engagement (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
    engagement_level TEXT NOT NULL DEFAULT 'medium',
    participation_balance REAL NOT NULL DEFAULT 0.0,
    question_count INTEGER NOT NULL DEFAULT 0,
    back_and_forth_ratio REAL NOT NULL DEFAULT 0.0
);
```

**Step 2: Add DB methods for analytics CRUD**

Add to `db.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerAnalytics {
    pub id: String,
    pub meeting_id: String,
    pub speaker_label: String,
    pub talk_time_ms: i64,
    pub turn_count: i64,
    pub interruption_count: i64,
    pub avg_turn_length_ms: i64,
    pub longest_monologue_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentSegment {
    pub id: String,
    pub meeting_id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub sentiment: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingEngagement {
    pub id: String,
    pub meeting_id: String,
    pub engagement_level: String,
    pub participation_balance: f64,
    pub question_count: i64,
    pub back_and_forth_ratio: f64,
}

pub fn save_speaker_analytics(&self, analytics: &[SpeakerAnalytics]) -> Result<()> { ... }
pub fn get_speaker_analytics(&self, meeting_id: &str) -> Result<Vec<SpeakerAnalytics>> { ... }
pub fn save_sentiment_segments(&self, segments: &[SentimentSegment]) -> Result<()> { ... }
pub fn get_sentiment_segments(&self, meeting_id: &str) -> Result<Vec<SentimentSegment>> { ... }
pub fn save_engagement(&self, engagement: &MeetingEngagement) -> Result<()> { ... }
pub fn get_engagement(&self, meeting_id: &str) -> Result<Option<MeetingEngagement>> { ... }
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: add analytics database tables and CRUD methods"
```

---

## Task 11: Build Talk-Time Analytics Engine

**Files:**
- Create: `src-tauri/src/analytics.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create analytics module**

Create `src-tauri/src/analytics.rs`:

```rust
use crate::db::{Database, SpeakerAnalytics, MeetingEngagement};
use anyhow::Result;
use std::collections::HashMap;

/// Compute talk-time analytics from transcript segments.
/// Call this after diarization is complete.
pub fn compute_speaker_analytics(
    db: &Database,
    meeting_id: &str,
) -> Result<Vec<SpeakerAnalytics>> {
    let transcripts = db.get_transcript(meeting_id)?;
    if transcripts.is_empty() {
        return Ok(vec![]);
    }

    // Group segments by speaker
    let mut speaker_segments: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    for seg in &transcripts {
        speaker_segments
            .entry(seg.speaker_label.clone())
            .or_default()
            .push((seg.start_ms, seg.end_ms));
    }

    // Sort segments by start time for each speaker
    for segments in speaker_segments.values_mut() {
        segments.sort_by_key(|s| s.0);
    }

    // Compute per-speaker analytics
    let mut results = Vec::new();
    for (speaker, segments) in &speaker_segments {
        let talk_time_ms: i64 = segments.iter().map(|(s, e)| e - s).sum();
        let turn_count = segments.len() as i64;
        let avg_turn_length_ms = if turn_count > 0 {
            talk_time_ms / turn_count
        } else {
            0
        };
        let longest_monologue_ms = segments.iter().map(|(s, e)| e - s).max().unwrap_or(0);

        results.push(SpeakerAnalytics {
            id: uuid::Uuid::new_v4().to_string(),
            meeting_id: meeting_id.to_string(),
            speaker_label: speaker.clone(),
            talk_time_ms,
            turn_count,
            interruption_count: 0, // computed below
            avg_turn_length_ms,
            longest_monologue_ms,
        });
    }

    // Compute interruptions: when speaker B starts within 500ms of speaker A ending
    let mut all_segments: Vec<(&str, i64, i64)> = transcripts
        .iter()
        .map(|s| (s.speaker_label.as_str(), s.start_ms, s.end_ms))
        .collect();
    all_segments.sort_by_key(|s| s.1);

    let mut interruption_counts: HashMap<String, i64> = HashMap::new();
    for window in all_segments.windows(2) {
        let (prev_speaker, _, prev_end) = window[0];
        let (curr_speaker, curr_start, _) = window[1];
        if prev_speaker != curr_speaker && curr_start < prev_end + 500 {
            *interruption_counts.entry(curr_speaker.to_string()).or_default() += 1;
        }
    }

    for analytics in &mut results {
        analytics.interruption_count = interruption_counts
            .get(&analytics.speaker_label)
            .copied()
            .unwrap_or(0);
    }

    Ok(results)
}

/// Compute engagement metrics from analytics data.
pub fn compute_engagement(
    meeting_id: &str,
    speaker_analytics: &[SpeakerAnalytics],
    transcript_texts: &[String],
) -> MeetingEngagement {
    // Participation balance: 1.0 = perfectly balanced, 0.0 = one person dominated
    let total_time: f64 = speaker_analytics.iter().map(|s| s.talk_time_ms as f64).sum();
    let speaker_count = speaker_analytics.len() as f64;
    let ideal_share = if speaker_count > 0.0 { 1.0 / speaker_count } else { 1.0 };
    let balance = if total_time > 0.0 && speaker_count > 1.0 {
        let variance: f64 = speaker_analytics
            .iter()
            .map(|s| {
                let share = s.talk_time_ms as f64 / total_time;
                (share - ideal_share).powi(2)
            })
            .sum::<f64>() / speaker_count;
        (1.0 - (variance * speaker_count).sqrt()).max(0.0)
    } else {
        0.5
    };

    // Count questions
    let question_count = transcript_texts
        .iter()
        .filter(|t| t.contains('?'))
        .count() as i64;

    // Back-and-forth: ratio of speaker switches to total turns
    let total_turns: i64 = speaker_analytics.iter().map(|s| s.turn_count).sum();
    let total_interruptions: i64 = speaker_analytics.iter().map(|s| s.interruption_count).sum();
    let back_and_forth = if total_turns > 1 {
        // More speaker switches = more interactive
        (total_turns as f64 - 1.0) / total_turns as f64
    } else {
        0.0
    };

    // Engagement level
    let score = (balance * 0.4) + (back_and_forth * 0.3)
        + ((question_count as f64 / total_turns.max(1) as f64).min(1.0) * 0.3);
    let level = if score > 0.65 {
        "high"
    } else if score > 0.35 {
        "medium"
    } else {
        "low"
    };

    MeetingEngagement {
        id: uuid::Uuid::new_v4().to_string(),
        meeting_id: meeting_id.to_string(),
        engagement_level: level.to_string(),
        participation_balance: balance,
        question_count,
        back_and_forth_ratio: back_and_forth,
    }
}
```

**Step 2: Register module**

Add `pub mod analytics;` to `src-tauri/src/lib.rs`.

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/analytics.rs src-tauri/src/lib.rs
git commit -m "feat: add talk-time and engagement analytics computation"
```

---

## Task 12: Add Sentiment Analysis via LLM

**Files:**
- Modify: `src-tauri/src/analytics.rs`

**Step 1: Add sentiment analysis function**

Add to `src-tauri/src/analytics.rs`:

```rust
use crate::db::SentimentSegment;
use crate::llm::LlmRegistry;

/// Analyze sentiment of transcript chunks using an LLM.
/// Groups transcript segments into ~30-second windows and classifies each.
pub async fn analyze_sentiment(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
) -> Result<Vec<SentimentSegment>> {
    let transcripts = db.get_transcript(meeting_id)?;
    if transcripts.is_empty() {
        return Ok(vec![]);
    }

    // Group into ~30-second windows
    let mut windows: Vec<(i64, i64, String)> = Vec::new();
    let window_ms = 30_000;
    let mut current_start = transcripts[0].start_ms;
    let mut current_texts: Vec<String> = Vec::new();
    let mut current_end = current_start;

    for seg in &transcripts {
        if seg.start_ms - current_start > window_ms && !current_texts.is_empty() {
            windows.push((current_start, current_end, current_texts.join(" ")));
            current_start = seg.start_ms;
            current_texts.clear();
        }
        current_texts.push(format!("{}: {}", seg.speaker_label, seg.text));
        current_end = seg.end_ms;
    }
    if !current_texts.is_empty() {
        windows.push((current_start, current_end, current_texts.join(" ")));
    }

    // Batch sentiment analysis via LLM
    let llm_provider = llm.get(provider)
        .ok_or_else(|| anyhow::anyhow!("LLM provider not found: {provider}"))?;

    let mut segments = Vec::new();
    for (start, end, text) in &windows {
        let prompt = format!(
            "Classify the sentiment of this meeting excerpt as exactly one of: positive, neutral, negative.\n\
             Also provide a confidence score from 0.0 to 1.0.\n\
             Respond ONLY with JSON: {{\"sentiment\": \"...\", \"score\": 0.0}}\n\n\
             Excerpt:\n{text}"
        );

        match llm_provider.complete(model, &prompt).await {
            Ok(response) => {
                // Parse JSON response
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&response) {
                    let sentiment = parsed["sentiment"].as_str().unwrap_or("neutral").to_string();
                    let score = parsed["score"].as_f64().unwrap_or(0.5);
                    segments.push(SentimentSegment {
                        id: uuid::Uuid::new_v4().to_string(),
                        meeting_id: meeting_id.to_string(),
                        start_ms: *start,
                        end_ms: *end,
                        sentiment,
                        score,
                    });
                }
            }
            Err(e) => {
                tracing::warn!("Sentiment analysis failed for window {start}-{end}: {e}");
            }
        }
    }

    Ok(segments)
}
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 3: Commit**

```bash
git add src-tauri/src/analytics.rs
git commit -m "feat: add LLM-based sentiment analysis for transcript windows"
```

---

## Task 13: Add Analytics Tauri Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)

**Step 1: Add analytics commands**

In `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub async fn compute_meeting_analytics(
    db: tauri::State<'_, crate::db::DbState>,
    meeting_id: String,
) -> Result<(), String> {
    let speaker_analytics = crate::analytics::compute_speaker_analytics(&db, &meeting_id)
        .map_err(|e| e.to_string())?;

    db.save_speaker_analytics(&speaker_analytics)
        .map_err(|e| e.to_string())?;

    let transcripts = db.get_transcript(&meeting_id).map_err(|e| e.to_string())?;
    let texts: Vec<String> = transcripts.iter().map(|t| t.text.clone()).collect();
    let engagement = crate::analytics::compute_engagement(&meeting_id, &speaker_analytics, &texts);

    db.save_engagement(&engagement).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn compute_meeting_sentiment(
    db: tauri::State<'_, crate::db::DbState>,
    llm: tauri::State<'_, LlmState>,
    meeting_id: String,
    provider: String,
    model: String,
) -> Result<(), String> {
    let registry = llm.read().await;
    let segments = crate::analytics::analyze_sentiment(&db, &registry, &meeting_id, &provider, &model)
        .await
        .map_err(|e| e.to_string())?;

    db.save_sentiment_segments(&segments)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_meeting_analytics(
    db: tauri::State<'_, crate::db::DbState>,
    meeting_id: String,
) -> Result<serde_json::Value, String> {
    let speakers = db.get_speaker_analytics(&meeting_id).map_err(|e| e.to_string())?;
    let sentiment = db.get_sentiment_segments(&meeting_id).map_err(|e| e.to_string())?;
    let engagement = db.get_engagement(&meeting_id).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "speakers": speakers,
        "sentiment": sentiment,
        "engagement": engagement,
    }))
}
```

**Step 2: Register commands**

Add to `invoke_handler` in `src-tauri/src/lib.rs`:

```rust
commands::compute_meeting_analytics,
commands::compute_meeting_sentiment,
commands::get_meeting_analytics,
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add analytics Tauri commands for computing and retrieving meeting analytics"
```

---

## Task 14: Auto-Compute Analytics After Transcription

**Files:**
- Modify: `src-tauri/src/commands.rs` (in `stop_recording` flow)

**Step 1: Add analytics computation to post-recording pipeline**

In the `stop_recording` command (or the auto-extraction spawn block), add analytics computation after diarization completes:

```rust
// After transcription/diarization completes, compute talk-time analytics
if let Err(e) = crate::analytics::compute_speaker_analytics(&db, &meeting_id)
    .and_then(|analytics| {
        db.save_speaker_analytics(&analytics)?;
        let transcripts = db.get_transcript(&meeting_id)?;
        let texts: Vec<String> = transcripts.iter().map(|t| t.text.clone()).collect();
        let engagement = crate::analytics::compute_engagement(&meeting_id, &analytics, &texts);
        db.save_engagement(&engagement)?;
        Ok(())
    })
{
    tracing::warn!("Failed to compute analytics for meeting {meeting_id}: {e}");
}

// Emit event so frontend knows analytics are ready
let _ = app_handle.emit("analytics-ready", &meeting_id);
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: auto-compute talk-time analytics after transcription completes"
```

---

## Task 15: Create useAnalytics Frontend Hook

**Files:**
- Create: `src/hooks/useAnalytics.ts`

**Step 1: Create the hook**

Create `src/hooks/useAnalytics.ts` following the same pattern as `useInsights.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SpeakerAnalytics {
  id: string;
  meeting_id: string;
  speaker_label: string;
  talk_time_ms: number;
  turn_count: number;
  interruption_count: number;
  avg_turn_length_ms: number;
  longest_monologue_ms: number;
}

interface SentimentSegment {
  id: string;
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  sentiment: "positive" | "neutral" | "negative";
  score: number;
}

interface MeetingEngagement {
  id: string;
  meeting_id: string;
  engagement_level: "high" | "medium" | "low";
  participation_balance: number;
  question_count: number;
  back_and_forth_ratio: number;
}

interface AnalyticsData {
  speakers: SpeakerAnalytics[];
  sentiment: SentimentSegment[];
  engagement: MeetingEngagement | null;
}

export function useAnalytics(meetingId: string) {
  const [data, setData] = useState<AnalyticsData>({
    speakers: [],
    sentiment: [],
    engagement: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const result = await invoke<AnalyticsData>("get_meeting_analytics", {
          meetingId,
        });
        setData(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [meetingId],
  );

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    const unlisten = listen<string>("analytics-ready", (event) => {
      if (event.payload === meetingId) {
        fetchAnalytics(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [meetingId, fetchAnalytics]);

  const computeAnalytics = useCallback(async () => {
    await invoke("compute_meeting_analytics", { meetingId });
    await fetchAnalytics(true);
  }, [meetingId, fetchAnalytics]);

  const computeSentiment = useCallback(
    async (provider: string, model: string) => {
      await invoke("compute_meeting_sentiment", {
        meetingId,
        provider,
        model,
      });
      await fetchAnalytics(true);
    },
    [meetingId, fetchAnalytics],
  );

  return {
    speakers: data.speakers,
    sentiment: data.sentiment,
    engagement: data.engagement,
    loading,
    error,
    refresh: fetchAnalytics,
    computeAnalytics,
    computeSentiment,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAnalytics.ts
git commit -m "feat: add useAnalytics hook for meeting analytics data"
```

---

## Task 16: Build Analytics Tab UI

**Files:**
- Create: `src/components/AnalyticsPanel.tsx`
- Modify: `src/pages/MeetingDetail.tsx` (add Analytics tab)

**Step 1: Create AnalyticsPanel component**

Create `src/components/AnalyticsPanel.tsx` with:

- **Talk-time bar chart**: Horizontal bars per speaker showing percentage of talk time. Use colored bars proportional to `talk_time_ms / total_time`. Show speaker label, time (formatted as mm:ss), and percentage.
- **Stats cards**: Total duration, speaker count, total interruptions, questions asked. Use the existing Card component from shadcn.
- **Engagement badge**: Colored badge (green=high, yellow=medium, red=low) showing engagement level.
- **Sentiment timeline**: A row of colored dots/bars showing sentiment over time. Green=positive, gray=neutral, red=negative. Use a simple div-based sparkline.
- **Sentiment analysis button**: Provider/model selector + "Analyze Sentiment" button (same pattern as summary generation).
- **Re-compute button**: "Refresh Analytics" to re-run computation.

Use the `useAnalytics` hook. Follow the same styling patterns as `InsightsPanel`.

```typescript
import { useAnalytics } from "../hooks/useAnalytics";
// ... component implementation
```

**Step 2: Add Analytics tab to MeetingDetail**

In `src/pages/MeetingDetail.tsx`, add the Analytics tab alongside Summaries and Insights (line 880-882):

```tsx
<TabsList className="w-full">
  <TabsTrigger value="summaries" className="flex-1">Summaries</TabsTrigger>
  <TabsTrigger value="insights" className="flex-1">Insights</TabsTrigger>
  <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
</TabsList>
```

And add the TabsContent (after the insights TabsContent, line 1001):

```tsx
<TabsContent value="analytics" className="flex flex-1 flex-col mt-0">
  <AnalyticsPanel meetingId={id!} providers={providers} models={models} />
</TabsContent>
```

**Step 3: Verify it compiles**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add src/components/AnalyticsPanel.tsx src/pages/MeetingDetail.tsx
git commit -m "feat: add Analytics tab with talk-time, sentiment, and engagement UI"
```

---

## Task 17: End-to-End Testing and Polish

**Files:**
- Various files for bug fixes discovered during testing

**Step 1: Test denoising pipeline**

- Download the DeepFilterNet3 model via the Settings > Models page
- Start a recording with background noise
- Verify the denoised audio sounds cleaner and transcription accuracy improves
- Verify the toggle in Settings works (disable → raw audio, enable → denoised)

**Step 2: Test meeting detection**

- Open Zoom or Teams
- Verify a notification appears within ~15 seconds
- Verify tapping the notification starts recording
- Verify dismissing has no effect
- Verify closing the meeting app resets detection (new notification next time)
- Verify the Settings toggle disables detection

**Step 3: Test analytics**

- Complete a recording with multiple speakers
- Navigate to the meeting detail page
- Click the Analytics tab
- Verify talk-time bars render correctly
- Verify stats cards show correct data
- Run sentiment analysis with an LLM provider
- Verify sentiment timeline appears

**Step 4: Fix any issues found during testing**

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: polish and bug fixes from end-to-end testing"
```
