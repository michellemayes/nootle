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
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::f32::consts::PI;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

const SAMPLE_RATE: u32 = 16000;
const MODEL_DIR_NAME: &str = "parakeet-tdt-0.6b-v3";

// Mel spectrogram parameters matching NeMo's AudioToMelSpectrogramPreprocessor
const N_FFT: usize = 512;
const HOP_LENGTH: usize = 160; // 10ms at 16kHz
const WIN_LENGTH: usize = 400; // 25ms at 16kHz
const N_MELS: usize = 128; // Parakeet 0.6B uses 128 mel bins
const F_MIN: f32 = 0.0;
const F_MAX: f32 = 8000.0; // Nyquist for 16kHz
const PREEMPHASIS: f32 = 0.97;
const LOG_ZERO_GUARD: f32 = 1e-10;

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
    mel_filterbank: Array2<f32>,
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

    /// Check if models are downloaded and ready in a given directory.
    fn check_status_in(dir: &Path) -> ModelStatus {
        let encoder_path = dir.join("encoder.onnx");
        let decoder_path = dir.join("decoder.onnx");
        let vocab_path = dir.join("vocab.txt");

        if encoder_path.exists() && decoder_path.exists() && vocab_path.exists() {
            ModelStatus::Ready
        } else {
            ModelStatus::NotDownloaded
        }
    }

    /// Check if models are downloaded and ready.
    pub fn check_status() -> ModelStatus {
        Self::check_status_in(&Self::model_dir())
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

        // Load vocabulary (format: "token id" per line — extract just the token)
        let vocab_text =
            std::fs::read_to_string(&vocab_path).context("Failed to load vocabulary file")?;
        let vocab: Vec<String> = vocab_text
            .lines()
            .map(|line| match line.rsplit_once(' ') {
                Some((token, _id)) => token.to_string(),
                None => line.to_string(),
            })
            .collect();

        let mel_filterbank = create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE, F_MIN, F_MAX);

        tracing::info!(
            vocab_size = vocab.len(),
            "Transcription engine loaded with CoreML acceleration"
        );

        Ok(Self {
            encoder,
            decoder,
            model_dir,
            vocab,
            mel_filterbank,
        })
    }

    /// Compute mel spectrogram from raw audio samples (16kHz mono f32).
    ///
    /// Pipeline: preemphasis -> frame + Hann window -> FFT -> power spectrum
    ///           -> mel filterbank -> log -> per-feature normalization
    fn compute_mel_spectrogram(&self, audio: &[f32]) -> Array2<f32> {
        // 1. Preemphasis: y[n] = x[n] - 0.97 * x[n-1]
        let audio = apply_preemphasis(audio, PREEMPHASIS);

        let n_frames = if audio.len() >= WIN_LENGTH {
            (audio.len() - WIN_LENGTH) / HOP_LENGTH + 1
        } else {
            return Array2::zeros((N_MELS, 1));
        };

        // Precompute Hann window
        let hann: Vec<f32> = (0..WIN_LENGTH)
            .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / WIN_LENGTH as f32).cos()))
            .collect();

        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(N_FFT);

        // Number of unique FFT bins (real signal symmetry)
        let n_freq = N_FFT / 2 + 1;
        let mut mel = Array2::zeros((N_MELS, n_frames));

        for frame_idx in 0..n_frames {
            let start = frame_idx * HOP_LENGTH;

            // 2. Window the frame and zero-pad to N_FFT
            let mut fft_buf: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); N_FFT];
            for i in 0..WIN_LENGTH {
                if start + i < audio.len() {
                    fft_buf[i] = Complex::new(audio[start + i] * hann[i], 0.0);
                }
            }

            // 3. FFT
            fft.process(&mut fft_buf);

            // 4. Power spectrum: |FFT[k]|^2 / N_FFT
            let power: Vec<f32> = fft_buf[..n_freq]
                .iter()
                .map(|c| (c.re * c.re + c.im * c.im) / N_FFT as f32)
                .collect();

            // 5. Apply mel filterbank and log
            for mel_idx in 0..N_MELS {
                let mut energy: f32 = 0.0;
                for k in 0..n_freq {
                    energy += self.mel_filterbank[[mel_idx, k]] * power[k];
                }
                mel[[mel_idx, frame_idx]] = (energy + LOG_ZERO_GUARD).ln();
            }
        }

        // 6. Per-feature normalization (mean=0, std=1 per mel bin)
        for mel_idx in 0..N_MELS {
            let mut sum = 0.0f64;
            let mut sum_sq = 0.0f64;
            for frame_idx in 0..n_frames {
                let v = mel[[mel_idx, frame_idx]] as f64;
                sum += v;
                sum_sq += v * v;
            }
            let mean = sum / n_frames as f64;
            let variance = (sum_sq / n_frames as f64) - mean * mean;
            let std = variance.max(1e-10).sqrt();

            for frame_idx in 0..n_frames {
                mel[[mel_idx, frame_idx]] =
                    ((mel[[mel_idx, frame_idx]] as f64 - mean) / std) as f32;
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
        let mel = self.compute_mel_spectrogram(audio);
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
                if token == "<unk>" || token == "<pad>" || token.starts_with("<|") {
                    continue;
                }
                // Handle SentencePiece underscore prefix (word boundary)
                if let Some(stripped) = token.strip_prefix('\u{2581}') {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(stripped);
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

// ── Mel spectrogram helpers ──────────────────────────────────────────────────

/// Apply preemphasis filter: y[n] = x[n] - coeff * x[n-1]
fn apply_preemphasis(audio: &[f32], coeff: f32) -> Vec<f32> {
    if audio.is_empty() {
        return vec![];
    }
    let mut out = Vec::with_capacity(audio.len());
    out.push(audio[0]);
    for i in 1..audio.len() {
        out.push(audio[i] - coeff * audio[i - 1]);
    }
    out
}

/// Convert frequency in Hz to mel scale.
fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

/// Convert mel scale value to Hz.
fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

/// Create a mel filterbank matrix of shape [n_mels, n_fft/2 + 1].
///
/// Each row is a triangular filter centered on a mel-spaced frequency.
fn create_mel_filterbank(
    n_fft: usize,
    n_mels: usize,
    sample_rate: u32,
    f_min: f32,
    f_max: f32,
) -> Array2<f32> {
    let n_freq = n_fft / 2 + 1;
    let mel_min = hz_to_mel(f_min);
    let mel_max = hz_to_mel(f_max);

    // n_mels + 2 points to define n_mels triangular filters
    let mel_points: Vec<f32> = (0..=(n_mels + 1))
        .map(|i| mel_min + (mel_max - mel_min) * i as f32 / (n_mels + 1) as f32)
        .collect();

    // Convert mel points to FFT bin indices
    let bin_points: Vec<f32> = mel_points
        .iter()
        .map(|&m| mel_to_hz(m) * n_fft as f32 / sample_rate as f32)
        .collect();

    let mut filterbank = Array2::zeros((n_mels, n_freq));

    for m in 0..n_mels {
        let f_left = bin_points[m];
        let f_center = bin_points[m + 1];
        let f_right = bin_points[m + 2];

        for k in 0..n_freq {
            let freq = k as f32;
            if freq >= f_left && freq <= f_center && f_center > f_left {
                filterbank[[m, k]] = (freq - f_left) / (f_center - f_left);
            } else if freq > f_center && freq <= f_right && f_right > f_center {
                filterbank[[m, k]] = (f_right - freq) / (f_right - f_center);
            }
        }
    }

    filterbank
}

// ── Shared engine ────────────────────────────────────────────────────────────

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
        ModelStatus::Downloading { progress } => Err(anyhow!(
            "Models still downloading: {:.0}%",
            progress * 100.0
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_status_not_downloaded() {
        let tmp = tempfile::tempdir().unwrap();
        let status = TranscriptionEngine::check_status_in(tmp.path());
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
    fn test_mel_filterbank_shape() {
        let fb = create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE, F_MIN, F_MAX);
        assert_eq!(fb.dim(), (N_MELS, N_FFT / 2 + 1));
    }

    #[test]
    fn test_mel_filterbank_non_negative() {
        let fb = create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE, F_MIN, F_MAX);
        for &v in fb.iter() {
            assert!(v >= 0.0, "Filterbank values must be non-negative");
        }
    }

    #[test]
    fn test_mel_filterbank_speech_filters_nonzero() {
        let fb = create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE, F_MIN, F_MAX);
        // Skip the lowest filters (< ~50 Hz) which may be all-zero because
        // their triangles are narrower than one FFT bin. Speech energy is
        // above 80 Hz so this is fine.
        let mut nonzero_count = 0;
        for m in 0..N_MELS {
            let sum: f32 = (0..N_FFT / 2 + 1).map(|k| fb[[m, k]]).sum();
            if sum > 0.0 {
                nonzero_count += 1;
            }
        }
        // At least 120 of 128 filters should have nonzero response
        assert!(
            nonzero_count >= 120,
            "Only {nonzero_count}/128 filters have nonzero response"
        );
    }

    #[test]
    fn test_preemphasis() {
        let audio = vec![1.0, 2.0, 3.0, 4.0];
        let out = apply_preemphasis(&audio, 0.97);
        assert_eq!(out.len(), 4);
        assert!((out[0] - 1.0).abs() < 1e-6);
        assert!((out[1] - (2.0 - 0.97)).abs() < 1e-6);
        assert!((out[2] - (3.0 - 0.97 * 2.0)).abs() < 1e-6);
    }

    #[test]
    fn test_hz_mel_roundtrip() {
        for hz in [0.0, 100.0, 440.0, 1000.0, 4000.0, 8000.0] {
            let roundtrip = mel_to_hz(hz_to_mel(hz));
            assert!(
                (roundtrip - hz).abs() < 0.01,
                "Roundtrip failed for {hz}: got {roundtrip}"
            );
        }
    }

    #[test]
    fn test_preemphasis_empty() {
        let out = apply_preemphasis(&[], 0.97);
        assert!(out.is_empty());
    }
}
