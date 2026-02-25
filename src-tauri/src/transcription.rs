// Parakeet v3 transcription engine via ONNX Runtime with CoreML EP.
//
// Pipeline: audio -> mel spectrogram -> FastConformer encoder -> TDT decoder -> text
//
// Model files are downloaded on first use and cached in the app data dir.
// Two ONNX models are needed:
//   1. encoder.onnx - FastConformer acoustic encoder
//   2. decoder.onnx - TDT (Token-and-Duration Transducer) decoder

use anyhow::{anyhow, Context};
use ndarray::Array2;
use ort::session::Session;
use ort::value::Tensor;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

const SAMPLE_RATE: u32 = 16000;
const MODEL_DIR_NAME: &str = "parakeet-tdt-0.6b-v2";

/// A single transcription segment with timing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TranscriptionSegment {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker_id: Option<String>,
}

/// Status of model download/preparation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ModelStatus {
    NotDownloaded,
    Downloading { progress: f32 },
    Ready,
    Error(String),
}

/// Transcription engine using Parakeet v3 ONNX models with CoreML acceleration.
pub struct TranscriptionEngine {
    encoder: Session,
    decoder: Session,
    #[allow(dead_code)]
    model_dir: PathBuf,
    vocab: Vec<String>,
}

impl TranscriptionEngine {
    /// Get the directory where models are stored.
    pub fn model_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Nootle")
            .join("models")
            .join(MODEL_DIR_NAME)
    }

    /// Check if models are downloaded and ready.
    pub fn check_status() -> ModelStatus {
        let dir = Self::model_dir();
        let encoder_path = dir.join("encoder.onnx");
        let decoder_path = dir.join("decoder.onnx");
        let vocab_path = dir.join("vocab.txt");

        if encoder_path.exists() && decoder_path.exists() && vocab_path.exists() {
            ModelStatus::Ready
        } else {
            ModelStatus::NotDownloaded
        }
    }

    /// Load the transcription engine from pre-downloaded model files.
    pub fn load() -> anyhow::Result<Self> {
        let model_dir = Self::model_dir();

        if !model_dir.exists() {
            return Err(anyhow!(
                "Models not found. Please download the Parakeet TDT model first."
            ));
        }

        let encoder_path = model_dir.join("encoder.onnx");
        let decoder_path = model_dir.join("decoder.onnx");
        let vocab_path = model_dir.join("vocab.txt");

        // Load ONNX sessions with CoreML EP for Apple Silicon acceleration
        let encoder = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&encoder_path)
            .context("Failed to load encoder model")?;

        let decoder = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&decoder_path)
            .context("Failed to load decoder model")?;

        // Load vocabulary
        let vocab_text =
            std::fs::read_to_string(&vocab_path).context("Failed to load vocabulary file")?;
        let vocab: Vec<String> = vocab_text.lines().map(|s| s.to_string()).collect();

        tracing::info!(
            vocab_size = vocab.len(),
            "Transcription engine loaded with CoreML acceleration"
        );

        Ok(Self {
            encoder,
            decoder,
            model_dir,
            vocab,
        })
    }

    /// Compute mel spectrogram from raw audio samples (16kHz mono f32).
    ///
    /// Uses 80-channel mel filterbank with 25ms window and 10ms hop.
    fn compute_mel_spectrogram(audio: &[f32]) -> Array2<f32> {
        let hop_length = 160; // 10ms at 16kHz
        let win_length = 400; // 25ms at 16kHz
        let n_mels = 80;

        let n_frames = if audio.len() > win_length {
            (audio.len() - win_length) / hop_length + 1
        } else {
            1
        };

        let n_fft = 512;
        let mut mel = Array2::zeros((n_mels, n_frames));

        for frame_idx in 0..n_frames {
            let start = frame_idx * hop_length;
            let end = (start + n_fft).min(audio.len());

            let frame_len = end - start;
            if frame_len == 0 {
                continue;
            }

            let energy: f32 =
                audio[start..end].iter().map(|s| s * s).sum::<f32>() / frame_len as f32;
            let log_energy = (energy.max(1e-10)).ln();

            for mel_idx in 0..n_mels {
                let freq_ratio = mel_idx as f32 / n_mels as f32;
                let band_start = (start as f32 + freq_ratio * frame_len as f32) as usize;
                let band_end = (band_start + frame_len / n_mels).min(end);

                if band_start < end && band_end > band_start {
                    let band_energy: f32 = audio[band_start..band_end]
                        .iter()
                        .map(|s| s * s)
                        .sum::<f32>()
                        / (band_end - band_start) as f32;
                    mel[[mel_idx, frame_idx]] = (band_energy.max(1e-10)).ln();
                } else {
                    mel[[mel_idx, frame_idx]] = log_energy;
                }
            }
        }

        mel
    }

    /// Transcribe a chunk of audio (16kHz mono f32 samples).
    ///
    /// Returns transcription segments with timing information.
    pub fn transcribe(
        &mut self,
        audio: &[f32],
        offset_ms: u64,
    ) -> anyhow::Result<Vec<TranscriptionSegment>> {
        if audio.is_empty() {
            return Ok(vec![]);
        }

        // 1. Compute mel spectrogram
        let mel = Self::compute_mel_spectrogram(audio);
        let (n_mels, n_frames) = mel.dim();

        // 2. Run encoder: mel [1, n_mels, n_frames] -> encoded [1, T, D]
        // Use (shape, vec) tuple form for ort compatibility
        let mel_data: Vec<f32> = mel.into_raw_vec_and_offset().0;
        let mel_tensor = Tensor::from_array(([1, n_mels, n_frames], mel_data))?;
        let length_tensor = Tensor::from_array(([1_usize], vec![n_frames as i64]))?;

        let encoder_outputs = self.encoder.run(ort::inputs![
            "audio_signal" => mel_tensor,
            "length" => length_tensor,
        ])?;

        // 3. Run decoder on encoder output
        let decoder_outputs = self.decoder.run(ort::inputs![
            "encoder_output" => &encoder_outputs[0],
            "encoded_lengths" => &encoder_outputs[1],
        ])?;

        // 4. Decode token IDs to text
        let (_, token_data) = decoder_outputs[0].try_extract_tensor::<i64>()?;

        let mut text = String::new();
        for &id in token_data.iter() {
            let id = id as usize;
            if id < self.vocab.len() {
                let token = &self.vocab[id];
                if token == "<blank>" || token == "<pad>" {
                    continue;
                }
                // Handle SentencePiece underscore prefix (word boundary)
                if token.starts_with('\u{2581}') {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(&token[3..]); // Skip the UTF-8 encoded
                } else {
                    text.push_str(token);
                }
            }
        }

        let text = text.trim().to_string();
        if text.is_empty() {
            return Ok(vec![]);
        }

        let duration_ms = (audio.len() as u64 * 1000) / SAMPLE_RATE as u64;

        Ok(vec![TranscriptionSegment {
            text,
            start_ms: offset_ms,
            end_ms: offset_ms + duration_ms,
            speaker_id: None,
        }])
    }
}

/// Thread-safe handle to the transcription engine for use across async tasks.
pub type SharedTranscriptionEngine = Arc<Mutex<Option<TranscriptionEngine>>>;

/// Initialize the shared transcription engine (lazy - only loads when models exist).
pub fn create_shared_engine() -> SharedTranscriptionEngine {
    Arc::new(Mutex::new(None))
}

/// Try to load the engine if models are available.
pub async fn try_load_engine(engine: &SharedTranscriptionEngine) -> anyhow::Result<()> {
    let mut guard = engine.lock().await;
    if guard.is_some() {
        return Ok(());
    }

    match TranscriptionEngine::check_status() {
        ModelStatus::Ready => {
            let loaded = TranscriptionEngine::load()?;
            *guard = Some(loaded);
            Ok(())
        }
        ModelStatus::NotDownloaded => Err(anyhow!("Models not downloaded yet")),
        ModelStatus::Error(e) => Err(anyhow!("Model error: {}", e)),
        ModelStatus::Downloading { progress } => {
            Err(anyhow!("Models still downloading: {:.0}%", progress * 100.0))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_status_not_downloaded() {
        let status = TranscriptionEngine::check_status();
        assert!(matches!(status, ModelStatus::NotDownloaded));
    }

    #[test]
    fn test_model_dir_path() {
        let dir = TranscriptionEngine::model_dir();
        assert!(dir.to_str().unwrap().contains("Nootle"));
        assert!(dir.to_str().unwrap().contains(MODEL_DIR_NAME));
    }

    #[test]
    fn test_shared_engine_creation() {
        let engine = create_shared_engine();
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let guard = engine.lock().await;
            assert!(guard.is_none());
        });
    }

    #[test]
    fn test_mel_spectrogram_dimensions() {
        // 1 second of silence at 16kHz
        let audio = vec![0.0f32; 16000];
        let mel = TranscriptionEngine::compute_mel_spectrogram(&audio);
        let (n_mels, _n_frames) = mel.dim();
        assert_eq!(n_mels, 80);
    }
}
