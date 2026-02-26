// Speaker diarization using pyannote-rs (segmentation-3.0 + WeSpeaker).
//
// Processes audio in overlapping windows, produces speaker labels that
// can be attached to transcript segments.
//
// Models needed (ONNX):
//   1. pyannote-segmentation-3.0.onnx — speaker segmentation
//   2. wespeaker-voxceleb-resnet34.onnx — speaker embedding

use anyhow::{anyhow, Context};
use ort::session::Session;
use ort::value::Tensor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

const SEGMENT_DURATION_SEC: f32 = 10.0;
const SEGMENT_STEP_SEC: f32 = 5.0;
const SAMPLE_RATE: u32 = 16000;

/// A detected speaker segment with timing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SpeakerSegment {
    pub speaker_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub confidence: f32,
}

/// Speaker embedding vector for clustering.
#[derive(Debug, Clone)]
struct SpeakerEmbedding {
    id: String,
    vector: Vec<f32>,
}

/// Speaker diarization engine.
pub struct DiarizationEngine {
    segmentation: Session,
    embedding: Session,
    #[allow(dead_code)]
    model_dir: PathBuf,
    known_speakers: Vec<SpeakerEmbedding>,
    next_speaker_id: usize,
}

impl DiarizationEngine {
    /// Get the directory where diarization models are stored.
    pub fn model_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Nootle")
            .join("models")
            .join("diarization")
    }

    /// Check if diarization models are available in a given directory.
    fn models_available_in(dir: &Path) -> bool {
        dir.join("segmentation.onnx").exists() && dir.join("embedding.onnx").exists()
    }

    /// Check if diarization models are available.
    pub fn models_available() -> bool {
        Self::models_available_in(&Self::model_dir())
    }

    /// Load the diarization engine from pre-downloaded ONNX models.
    pub fn load() -> anyhow::Result<Self> {
        let model_dir = Self::model_dir();

        if !model_dir.exists() {
            return Err(anyhow!(
                "Diarization models not found. Please download them first."
            ));
        }

        let seg_path = model_dir.join("segmentation.onnx");
        let emb_path = model_dir.join("embedding.onnx");

        let segmentation = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&seg_path)
            .context("Failed to load segmentation model")?;

        let embedding = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&emb_path)
            .context("Failed to load embedding model")?;

        tracing::info!("Diarization engine loaded with CoreML acceleration");

        Ok(Self {
            segmentation,
            embedding,
            model_dir,
            known_speakers: Vec::new(),
            next_speaker_id: 0,
        })
    }

    /// Reset speaker tracking (e.g., between meetings).
    pub fn reset_speakers(&mut self) {
        self.known_speakers.clear();
        self.next_speaker_id = 0;
    }

    /// Diarize a chunk of audio, returning speaker segments.
    ///
    /// Audio should be 16kHz mono f32 samples.
    pub fn diarize(
        &mut self,
        audio: &[f32],
        offset_ms: u64,
    ) -> anyhow::Result<Vec<SpeakerSegment>> {
        if audio.is_empty() {
            return Ok(vec![]);
        }

        let segment_samples = (SEGMENT_DURATION_SEC * SAMPLE_RATE as f32) as usize;
        let step_samples = (SEGMENT_STEP_SEC * SAMPLE_RATE as f32) as usize;

        let mut all_segments = Vec::new();
        let mut offset = 0;

        while offset < audio.len() {
            let end = (offset + segment_samples).min(audio.len());
            let chunk = &audio[offset..end];

            // Pad short chunks to the expected segment length
            let padded = if chunk.len() < segment_samples {
                let mut padded = vec![0.0f32; segment_samples];
                padded[..chunk.len()].copy_from_slice(chunk);
                padded
            } else {
                chunk.to_vec()
            };

            let chunk_offset_ms = offset_ms + (offset as u64 * 1000 / SAMPLE_RATE as u64);

            match self.process_segment(&padded, chunk_offset_ms) {
                Ok(segments) => all_segments.extend(segments),
                Err(e) => {
                    tracing::warn!("Diarization segment failed: {}", e);
                }
            }

            offset += step_samples;
        }

        // Merge adjacent segments with same speaker
        let merged = Self::merge_segments(all_segments);

        Ok(merged)
    }

    /// Process a single 10-second audio segment.
    fn process_segment(
        &mut self,
        audio: &[f32],
        offset_ms: u64,
    ) -> anyhow::Result<Vec<SpeakerSegment>> {
        // 1. Run segmentation model
        let n_samples = audio.len();
        let input_tensor = Tensor::from_array(([1, n_samples], audio.to_vec()))?;

        let seg_outputs = self
            .segmentation
            .run(ort::inputs!["input" => input_tensor])?;

        // Segmentation output: [1, n_frames, n_speakers]
        // Copy data out so we can drop seg_outputs before calling identify_speaker
        let (seg_shape, seg_data_ref) = seg_outputs[0].try_extract_tensor::<f32>()?;
        let seg_dims: Vec<usize> = seg_shape.iter().map(|&d| d as usize).collect();
        let seg_data: Vec<f32> = seg_data_ref.to_vec();
        drop(seg_outputs);

        if seg_dims.len() < 3 {
            return Ok(vec![]);
        }

        let n_frames = seg_dims[1];
        let n_speakers = seg_dims[2];
        let frame_duration_ms = (SEGMENT_DURATION_SEC * 1000.0 / n_frames as f32) as u64;

        let mut segments = Vec::new();

        for speaker_idx in 0..n_speakers {
            let mut active_start: Option<usize> = None;

            for frame_idx in 0..n_frames {
                let flat_idx = frame_idx * n_speakers + speaker_idx;
                let prob = seg_data.get(flat_idx).copied().unwrap_or(0.0);

                if prob > 0.5 {
                    if active_start.is_none() {
                        active_start = Some(frame_idx);
                    }
                } else if let Some(start) = active_start.take() {
                    let start_ms = offset_ms + start as u64 * frame_duration_ms;
                    let end_ms = offset_ms + frame_idx as u64 * frame_duration_ms;

                    let audio_start = start * n_samples / n_frames;
                    let audio_end = (frame_idx * n_samples / n_frames).min(n_samples);

                    if audio_end > audio_start {
                        let speaker_audio = &audio[audio_start..audio_end];
                        let speaker_id = self
                            .identify_speaker(speaker_audio)
                            .unwrap_or_else(|_| format!("Speaker {}", speaker_idx + 1));

                        segments.push(SpeakerSegment {
                            speaker_id,
                            start_ms,
                            end_ms,
                            confidence: prob,
                        });
                    }
                }
            }

            if let Some(start) = active_start {
                let start_ms = offset_ms + start as u64 * frame_duration_ms;
                let end_ms = offset_ms + n_frames as u64 * frame_duration_ms;

                segments.push(SpeakerSegment {
                    speaker_id: format!("Speaker {}", speaker_idx + 1),
                    start_ms,
                    end_ms,
                    confidence: 0.5,
                });
            }
        }

        Ok(segments)
    }

    /// Identify a speaker by comparing their embedding to known speakers.
    fn identify_speaker(&mut self, audio: &[f32]) -> anyhow::Result<String> {
        let embedding = self.compute_embedding(audio)?;

        // Compare with known speakers
        let mut best_match: Option<(usize, f32)> = None;
        for (idx, known) in self.known_speakers.iter().enumerate() {
            let similarity = cosine_similarity(&embedding, &known.vector);
            if let Some((_, best_sim)) = best_match {
                if similarity > best_sim {
                    best_match = Some((idx, similarity));
                }
            } else {
                best_match = Some((idx, similarity));
            }
        }

        // Threshold for considering it the same speaker
        const SIMILARITY_THRESHOLD: f32 = 0.75;

        if let Some((idx, sim)) = best_match {
            if sim >= SIMILARITY_THRESHOLD {
                return Ok(self.known_speakers[idx].id.clone());
            }
        }

        // New speaker
        self.next_speaker_id += 1;
        let id = format!("Speaker {}", self.next_speaker_id);
        self.known_speakers.push(SpeakerEmbedding {
            id: id.clone(),
            vector: embedding,
        });

        Ok(id)
    }

    /// Compute a speaker embedding vector from audio.
    fn compute_embedding(&mut self, audio: &[f32]) -> anyhow::Result<Vec<f32>> {
        let n_samples = audio.len();
        let input_tensor = Tensor::from_array(([1, n_samples], audio.to_vec()))?;

        let outputs = self.embedding.run(ort::inputs!["input" => input_tensor])?;

        let (_, emb_data) = outputs[0].try_extract_tensor::<f32>()?;
        Ok(emb_data.to_vec())
    }

    /// Merge adjacent segments with the same speaker.
    fn merge_segments(mut segments: Vec<SpeakerSegment>) -> Vec<SpeakerSegment> {
        if segments.len() <= 1 {
            return segments;
        }

        segments.sort_by_key(|s| s.start_ms);

        let mut merged = vec![segments[0].clone()];
        for seg in segments.into_iter().skip(1) {
            let last = merged.last_mut().unwrap();
            // Merge if same speaker and gap is less than 500ms
            if last.speaker_id == seg.speaker_id && seg.start_ms <= last.end_ms + 500 {
                last.end_ms = last.end_ms.max(seg.end_ms);
                last.confidence = (last.confidence + seg.confidence) / 2.0;
            } else {
                merged.push(seg);
            }
        }

        merged
    }
}

/// Compute cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

/// Thread-safe handle to the diarization engine.
pub type SharedDiarizationEngine = Arc<Mutex<Option<DiarizationEngine>>>;

pub fn create_shared_engine() -> SharedDiarizationEngine {
    Arc::new(Mutex::new(None))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }

    #[test]
    fn test_merge_segments_same_speaker() {
        let segments = vec![
            SpeakerSegment {
                speaker_id: "A".into(),
                start_ms: 0,
                end_ms: 1000,
                confidence: 0.9,
            },
            SpeakerSegment {
                speaker_id: "A".into(),
                start_ms: 1200,
                end_ms: 2000,
                confidence: 0.8,
            },
        ];
        let merged = DiarizationEngine::merge_segments(segments);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].end_ms, 2000);
    }

    #[test]
    fn test_merge_segments_different_speakers() {
        let segments = vec![
            SpeakerSegment {
                speaker_id: "A".into(),
                start_ms: 0,
                end_ms: 1000,
                confidence: 0.9,
            },
            SpeakerSegment {
                speaker_id: "B".into(),
                start_ms: 1200,
                end_ms: 2000,
                confidence: 0.8,
            },
        ];
        let merged = DiarizationEngine::merge_segments(segments);
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn test_models_not_available_in_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!DiarizationEngine::models_available_in(tmp.path()));
    }
}
