// Speaker diarization: pyannote segmentation-3.0 + WeSpeaker ResNet34 (ONNX).
//
// Works on the live stream one transcription chunk at a time. Each chunk is
// appended to a rolling 10 s context window, which is what the segmentation
// model expects. Segmentation finds who is talking in the newest chunk; the
// embedding model fingerprints that voice using everything they said in the
// window; online clustering maps the fingerprint to a meeting-wide
// "Speaker N" label.
//
// Models needed (ONNX):
//   1. segmentation.onnx — pyannote/segmentation-3.0
//      input_values [1, 1, 160000] → logits [1, 589, 7] (powerset classes)
//   2. embedding.onnx — WeSpeaker voxceleb ResNet34-LM
//      feats [1, T, 80] (Kaldi fbank) → embs [1, 256]

use crate::audio::rms;
use anyhow::{anyhow, Context};
use ort::session::Session;
use ort::value::Tensor;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::path::{Path, PathBuf};

const SAMPLE_RATE: usize = 16_000;
/// The segmentation model is trained on 10 s windows.
const WINDOW_SAMPLES: usize = SAMPLE_RATE * 10;
/// Powerset classes of segmentation-3.0: up to 3 local speakers, at most 2 at
/// once. Index 0 is silence.
const POWERSET: [[bool; 3]; 7] = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
];
/// Below this much speech in the new chunk, nobody is considered talking.
const MIN_ACTIVE_MS: usize = 250;
/// Shortest audio worth fingerprinting at all.
const MIN_EMBED_SAMPLES: usize = SAMPLE_RATE / 2;
/// Only a fingerprint from this much audio may introduce a new speaker; short
/// snippets are too noisy and would splinter one person into several.
const MIN_NEW_SPEAKER_SAMPLES: usize = SAMPLE_RATE * 3 / 2;
/// Cosine similarity at or above which a voice matches a known speaker.
const SIMILARITY_THRESHOLD: f32 = 0.5;

/// Speaker diarization engine. Keeps per-meeting state, so use one instance
/// per recording.
pub struct DiarizationEngine {
    segmentation: Session,
    embedding: Session,
    /// Most recent audio fed to [`DiarizationEngine::identify`], ≤ 10 s.
    window: Vec<f32>,
    clusters: SpeakerClusters,
    last_speaker: Option<usize>,
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

    /// Load the diarization engine from pre-downloaded ONNX models.
    pub fn load() -> anyhow::Result<Self> {
        let model_dir = Self::model_dir();
        if !Self::models_available_in(&model_dir) {
            return Err(anyhow!(
                "Diarization models not found. Please download them first."
            ));
        }

        let segmentation = crate::transcription::build_session(
            &model_dir.join("segmentation.onnx"),
            "segmentation",
            true,
        )?;
        let embedding = crate::transcription::build_session(
            &model_dir.join("embedding.onnx"),
            "speaker embedding",
            true,
        )?;
        tracing::info!("Diarization engine loaded");

        Ok(Self {
            segmentation,
            embedding,
            window: Vec::with_capacity(WINDOW_SAMPLES),
            clusters: SpeakerClusters::default(),
            last_speaker: None,
        })
    }

    /// Who is talking in `chunk` (16 kHz mono, the newest audio of this
    /// stream). Returns a meeting-wide label such as "Speaker 2", the
    /// previous speaker when the chunk holds too little speech to tell, or
    /// `None` before anyone has been heard.
    pub fn identify(&mut self, chunk: &[f32]) -> anyhow::Result<Option<String>> {
        self.window.extend_from_slice(chunk);
        if self.window.len() > WINDOW_SAMPLES {
            self.window.drain(..self.window.len() - WINDOW_SAMPLES);
        }

        // Right-align the window so the newest chunk is always at the end.
        let mut input = vec![0.0f32; WINDOW_SAMPLES - self.window.len()];
        input.extend_from_slice(&self.window);
        let new_from = WINDOW_SAMPLES - chunk.len().min(WINDOW_SAMPLES);

        let activity = self.segment(&input)?;
        if let Some(local) = dominant_local_speaker(&activity, WINDOW_SAMPLES, new_from) {
            let samples = speaker_samples(&input, &activity, local);
            if samples.len() >= MIN_EMBED_SAMPLES {
                let embedding = self.embed(&samples)?;
                let allow_new =
                    samples.len() >= MIN_NEW_SPEAKER_SAMPLES || self.clusters.is_empty();
                if let Some(speaker) = self.clusters.assign(&embedding, allow_new) {
                    self.last_speaker = Some(speaker);
                }
            }
        }
        Ok(self.last_speaker.map(speaker_label))
    }

    /// Per-frame activity of the (up to 3) local speakers in a 10 s window.
    fn segment(&mut self, window: &[f32]) -> anyhow::Result<Vec<[bool; 3]>> {
        let input = Tensor::from_array(([1_usize, 1, window.len()], window.to_vec()))?;
        let outputs = self
            .segmentation
            .run(ort::inputs!["input_values" => input])?;
        let (shape, logits) = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract segmentation logits")?;
        let classes = shape.last().copied().unwrap_or(0) as usize;
        if classes != POWERSET.len() {
            return Err(anyhow!(
                "Unexpected segmentation output shape {shape:?}; expected {} classes",
                POWERSET.len()
            ));
        }
        Ok(decode_powerset(logits))
    }

    /// 256-d voice fingerprint of `samples`.
    fn embed(&mut self, samples: &[f32]) -> anyhow::Result<Vec<f32>> {
        let (feats, n_frames) = fbank(samples);
        let input = Tensor::from_array(([1_usize, n_frames, N_MELS], feats))?;
        let outputs = self.embedding.run(ort::inputs!["feats" => input])?;
        let (_, emb) = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract speaker embedding")?;
        Ok(emb.to_vec())
    }
}

/// Label for whoever is at this Mac's microphone during a call.
const SELF_LABEL: &str = "You";
/// Label when diarization isn't available to tell remote speakers apart.
const UNKNOWN_LABEL: &str = "Speaker";
/// RMS above which a stream is taken to carry speech.
const SPEECH_RMS: f32 = 0.005;
/// How much louder the mic must be than system audio for a chunk to be the
/// local user. Remote voices leaking from the speakers into the mic arrive
/// far quieter than the digital system audio they came from.
const LOCAL_MARGIN: f32 = 2.0;
/// Chunks of remote speech that prove a call is in progress.
const CALL_EVIDENCE_CHUNKS: u32 = 3;

/// Where a chunk's speech came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Source {
    /// This Mac's user, on the microphone during a call.
    Local,
    /// Call participants, heard through system audio.
    Remote,
    /// Not a call (or no system audio): everyone is in the room on the mic.
    Room,
}

/// Names the speaker of each transcribed chunk. During a call (Zoom, Meet,
/// Teams, ...) the microphone is the user and system audio is everyone else,
/// so only system audio needs diarizing; that is both more accurate than
/// diarizing the mix and lets the user show up as "You". Without a call, all
/// voices share the mic and the whole mix is diarized.
pub struct SpeakerAttributor {
    engine: Option<DiarizationEngine>,
    in_call: bool,
    remote_speech_chunks: u32,
}

impl SpeakerAttributor {
    /// `in_call`: a meeting app already holds the mic, so this is a call
    /// even before anyone else speaks.
    pub fn new(engine: Option<DiarizationEngine>, in_call: bool) -> Self {
        Self {
            engine,
            in_call,
            remote_speech_chunks: 0,
        }
    }

    pub fn has_diarization(&self) -> bool {
        self.engine.is_some()
    }

    /// Note a chunk of audio, transcribed or not, as evidence of a call.
    /// `system` is empty when system audio isn't being captured.
    pub fn observe(&mut self, system: &[f32]) {
        if rms(system) > SPEECH_RMS {
            self.remote_speech_chunks += 1;
            if self.remote_speech_chunks >= CALL_EVIDENCE_CHUNKS {
                self.in_call = true;
            }
        }
    }

    /// Speaker label for a transcribed chunk. All three buffers cover the
    /// same 16 kHz span; `system` is empty without system audio capture.
    pub fn label(&mut self, mic: &[f32], system: &[f32], mixed: &[f32]) -> String {
        let source = classify(self.in_call && !system.is_empty(), rms(mic), rms(system));
        let audio = match source {
            Source::Local => return SELF_LABEL.to_string(),
            Source::Remote => system,
            Source::Room => mixed,
        };
        let Some(engine) = self.engine.as_mut() else {
            return UNKNOWN_LABEL.to_string();
        };
        match engine.identify(audio) {
            Ok(label) => label.unwrap_or_else(|| UNKNOWN_LABEL.to_string()),
            Err(e) => {
                tracing::warn!("Diarization failed: {e:#}");
                UNKNOWN_LABEL.to_string()
            }
        }
    }
}

fn classify(in_call: bool, mic_rms: f32, system_rms: f32) -> Source {
    if !in_call {
        Source::Room
    } else if mic_rms > system_rms * LOCAL_MARGIN {
        Source::Local
    } else {
        Source::Remote
    }
}

fn speaker_label(index: usize) -> String {
    format!("Speaker {}", index + 1)
}

/// Argmax each frame's powerset logits into per-speaker activity.
fn decode_powerset(logits: &[f32]) -> Vec<[bool; 3]> {
    let (frames, _) = logits.as_chunks::<{ POWERSET.len() }>();
    frames
        .iter()
        .map(|frame| {
            let best = frame
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.total_cmp(b.1))
                .map_or(0, |(i, _)| i);
            POWERSET[best]
        })
        .collect()
}

/// Sample range covered by `frame` when `n_frames` span `n_samples`.
fn frame_span(frame: usize, n_frames: usize, n_samples: usize) -> std::ops::Range<usize> {
    frame * n_samples / n_frames..(frame + 1) * n_samples / n_frames
}

/// The local speaker who talks most from sample `from` onwards, if anyone
/// talks for long enough to count.
fn dominant_local_speaker(activity: &[[bool; 3]], n_samples: usize, from: usize) -> Option<usize> {
    let n_frames = activity.len();
    let mut talk = [0usize; 3];
    for (i, frame) in activity.iter().enumerate() {
        if frame_span(i, n_frames, n_samples).start < from {
            continue;
        }
        for (spk, &active) in frame.iter().enumerate() {
            talk[spk] += usize::from(active);
        }
    }
    let min_frames = (MIN_ACTIVE_MS * SAMPLE_RATE / 1000) * n_frames / n_samples.max(1);
    (0..3)
        .max_by_key(|&s| talk[s])
        .filter(|&s| talk[s] > 0 && talk[s] >= min_frames)
}

/// Audio where `speaker` talks alone; overlapped speech pollutes the
/// fingerprint, so it is used only when there's nothing else.
fn speaker_samples(window: &[f32], activity: &[[bool; 3]], speaker: usize) -> Vec<f32> {
    let gather = |solo_only: bool| -> Vec<f32> {
        let n_frames = activity.len();
        activity
            .iter()
            .enumerate()
            .filter(|(_, f)| f[speaker] && (!solo_only || f.iter().filter(|&&a| a).count() == 1))
            .flat_map(|(i, _)| {
                window[frame_span(i, n_frames, window.len())]
                    .iter()
                    .copied()
            })
            .collect()
    };
    let solo = gather(true);
    if solo.len() >= MIN_EMBED_SAMPLES {
        solo
    } else {
        gather(false)
    }
}

/// Online clustering of voice fingerprints into meeting-wide speakers.
#[derive(Default)]
struct SpeakerClusters {
    /// Sum of the L2-normalised embeddings assigned to each speaker.
    centroids: Vec<Vec<f32>>,
}

impl SpeakerClusters {
    fn is_empty(&self) -> bool {
        self.centroids.is_empty()
    }

    /// Index of the speaker `embedding` belongs to. Creates a new speaker
    /// when nobody matches and `allow_new`; otherwise falls back to the
    /// closest one. `None` only when there are no speakers and none may be
    /// created.
    fn assign(&mut self, embedding: &[f32], allow_new: bool) -> Option<usize> {
        let norm = l2_norm(embedding);
        if norm == 0.0 {
            return None;
        }
        let unit: Vec<f32> = embedding.iter().map(|x| x / norm).collect();

        let best = self
            .centroids
            .iter()
            .map(|c| cosine_similarity(&unit, c))
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(&b.1));

        let index = match best {
            Some((i, sim)) if sim >= SIMILARITY_THRESHOLD || !allow_new => i,
            None if !allow_new => return None,
            _ => {
                self.centroids.push(vec![0.0; unit.len()]);
                self.centroids.len() - 1
            }
        };
        for (c, u) in self.centroids[index].iter_mut().zip(&unit) {
            *c += u;
        }
        Some(index)
    }
}

fn l2_norm(v: &[f32]) -> f32 {
    v.iter().map(|x| x * x).sum::<f32>().sqrt()
}

/// Compute cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let (norm_a, norm_b) = (l2_norm(a), l2_norm(b));
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    dot / (norm_a * norm_b)
}

// ── Kaldi-compatible fbank (what WeSpeaker was trained on) ──────────────────

const N_MELS: usize = 80;
const FRAME_LEN: usize = 400; // 25 ms
const FRAME_SHIFT: usize = 160; // 10 ms
const PADDED_LEN: usize = 512;
const PREEMPHASIS: f32 = 0.97;
const LOW_FREQ: f32 = 20.0;

fn kaldi_mel(hz: f32) -> f32 {
    1127.0 * (1.0 + hz / 700.0).ln()
}

/// Kaldi mel filterbank over the first `PADDED_LEN / 2` FFT bins, built once.
fn kaldi_mel_banks() -> &'static [Vec<f32>] {
    static BANKS: std::sync::OnceLock<Vec<Vec<f32>>> = std::sync::OnceLock::new();
    BANKS.get_or_init(build_kaldi_mel_banks)
}

fn build_kaldi_mel_banks() -> Vec<Vec<f32>> {
    let n_bins = PADDED_LEN / 2;
    let bin_hz = SAMPLE_RATE as f32 / PADDED_LEN as f32;
    let mel_low = kaldi_mel(LOW_FREQ);
    let mel_high = kaldi_mel(SAMPLE_RATE as f32 / 2.0);
    let delta = (mel_high - mel_low) / (N_MELS + 1) as f32;
    (0..N_MELS)
        .map(|m| {
            let left = mel_low + m as f32 * delta;
            let center = left + delta;
            let right = center + delta;
            (0..n_bins)
                .map(|k| {
                    let mel = kaldi_mel(k as f32 * bin_hz);
                    if mel <= left || mel >= right {
                        0.0
                    } else if mel <= center {
                        (mel - left) / (center - left)
                    } else {
                        (right - mel) / (right - center)
                    }
                })
                .collect()
        })
        .collect()
}

/// 80-bin log-mel fbank matching `torchaudio.compliance.kaldi.fbank` with
/// WeSpeaker's settings (hamming window, no dither, int16 scale), followed by
/// per-utterance mean normalisation. Returns `(row-major [T, 80], T)`.
fn fbank(samples: &[f32]) -> (Vec<f32>, usize) {
    if samples.len() < FRAME_LEN {
        return (Vec::new(), 0);
    }
    let n_frames = 1 + (samples.len() - FRAME_LEN) / FRAME_SHIFT;
    let banks = kaldi_mel_banks();
    let window: Vec<f32> = (0..FRAME_LEN)
        .map(|i| {
            0.54 - 0.46 * (2.0 * std::f32::consts::PI * i as f32 / (FRAME_LEN - 1) as f32).cos()
        })
        .collect();
    let fft = FftPlanner::<f32>::new().plan_fft_forward(PADDED_LEN);

    let mut feats = Vec::with_capacity(n_frames * N_MELS);
    let mut frame = [0.0f32; FRAME_LEN];
    let mut buf = vec![Complex::new(0.0f32, 0.0); PADDED_LEN];
    for f in 0..n_frames {
        let start = f * FRAME_SHIFT;
        for (dst, &s) in frame.iter_mut().zip(&samples[start..start + FRAME_LEN]) {
            *dst = s * 32768.0;
        }
        let mean = frame.iter().sum::<f32>() / FRAME_LEN as f32;
        frame.iter_mut().for_each(|s| *s -= mean);
        for i in (1..FRAME_LEN).rev() {
            frame[i] -= PREEMPHASIS * frame[i - 1];
        }
        frame[0] -= PREEMPHASIS * frame[0];

        buf.iter_mut().for_each(|c| *c = Complex::new(0.0, 0.0));
        for (c, (&s, &w)) in buf.iter_mut().zip(frame.iter().zip(&window)) {
            c.re = s * w;
        }
        fft.process(&mut buf);
        let power: Vec<f32> = buf[..PADDED_LEN / 2].iter().map(|c| c.norm_sqr()).collect();

        for bank in banks {
            let energy: f32 = bank.iter().zip(&power).map(|(w, p)| w * p).sum();
            feats.push(energy.max(f32::EPSILON).ln());
        }
    }

    // Cepstral mean normalisation, as WeSpeaker applies before inference.
    for m in 0..N_MELS {
        let mean = (0..n_frames).map(|t| feats[t * N_MELS + m]).sum::<f32>() / n_frames as f32;
        for t in 0..n_frames {
            feats[t * N_MELS + m] -= mean;
        }
    }
    (feats, n_frames)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        assert!(cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]).abs() < 1e-6);
    }

    #[test]
    fn test_decode_powerset_picks_argmax() {
        #[rustfmt::skip]
        let logits = [
            0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, // silence
            0.0, 0.0, 0.9, 0.0, 0.0, 0.0, 0.0, // speaker 2
            0.0, 0.0, 0.0, 0.0, 0.0, 0.9, 0.0, // speakers 1 + 3
        ];
        assert_eq!(
            decode_powerset(&logits),
            vec![
                [false, false, false],
                [false, true, false],
                [true, false, true]
            ]
        );
    }

    #[test]
    fn test_dominant_speaker_only_counts_new_audio() {
        // 100 frames over 10 s; speaker 0 talks in the old audio, speaker 1
        // in the newest 2 s.
        let mut activity = vec![[false; 3]; 100];
        activity[..80].iter_mut().for_each(|f| f[0] = true);
        activity[85..].iter_mut().for_each(|f| f[1] = true);
        let from = WINDOW_SAMPLES - 2 * SAMPLE_RATE;
        assert_eq!(
            dominant_local_speaker(&activity, WINDOW_SAMPLES, from),
            Some(1)
        );
    }

    #[test]
    fn test_dominant_speaker_ignores_brief_noise() {
        let mut activity = vec![[false; 3]; 100];
        activity[99][2] = true; // 100 ms blip
        let from = WINDOW_SAMPLES - 2 * SAMPLE_RATE;
        assert_eq!(
            dominant_local_speaker(&activity, WINDOW_SAMPLES, from),
            None
        );
    }

    #[test]
    fn test_speaker_samples_prefers_solo_speech() {
        let window: Vec<f32> = (0..WINDOW_SAMPLES).map(|i| i as f32).collect();
        let mut activity = vec![[false; 3]; 10];
        activity[0] = [true, false, false];
        activity[1] = [true, true, false]; // overlap
        let samples = speaker_samples(&window, &activity, 0);
        assert_eq!(samples.len(), WINDOW_SAMPLES / 10);
        assert_eq!(samples[0], 0.0);
    }

    #[test]
    fn test_clusters_match_and_split() {
        let mut clusters = SpeakerClusters::default();
        assert_eq!(clusters.assign(&[1.0, 0.0, 0.0], true), Some(0));
        assert_eq!(clusters.assign(&[0.9, 0.1, 0.0], true), Some(0));
        assert_eq!(clusters.assign(&[0.0, 1.0, 0.0], true), Some(1));
        // A short, unconvincing sample joins the closest speaker.
        assert_eq!(clusters.assign(&[0.2, 0.0, 1.0], false), Some(0));
    }

    #[test]
    fn test_clusters_need_permission_for_first_speaker() {
        let mut clusters = SpeakerClusters::default();
        assert_eq!(clusters.assign(&[1.0, 0.0], false), None);
        assert_eq!(clusters.assign(&[0.0, 0.0], true), None);
    }

    #[test]
    fn test_fbank_shape_and_normalisation() {
        let tone: Vec<f32> = (0..SAMPLE_RATE)
            .map(|i| (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / SAMPLE_RATE as f32).sin())
            .collect();
        let (feats, n_frames) = fbank(&tone);
        assert_eq!(n_frames, 1 + (SAMPLE_RATE - FRAME_LEN) / FRAME_SHIFT);
        assert_eq!(feats.len(), n_frames * N_MELS);
        let mean0 = (0..n_frames).map(|t| feats[t * N_MELS]).sum::<f32>() / n_frames as f32;
        assert!(mean0.abs() < 1e-3);
        assert_eq!(fbank(&tone[..100]).1, 0);
    }

    #[test]
    fn test_classify_splits_mic_from_system_audio() {
        assert_eq!(classify(true, 0.1, 0.0), Source::Local);
        assert_eq!(classify(true, 0.0, 0.1), Source::Remote);
        // Remote voice leaking from the speakers into the mic.
        assert_eq!(classify(true, 0.03, 0.1), Source::Remote);
        // Not a call: everyone shares the mic.
        assert_eq!(classify(false, 0.1, 0.0), Source::Room);
    }

    #[test]
    fn test_attributor_needs_sustained_remote_speech_for_call() {
        let mut attributor = SpeakerAttributor::new(None, false);
        let talk = vec![0.1f32; 320];
        let silence = vec![0.0f32; 320];
        attributor.observe(&talk); // a notification sound isn't a call
        assert_eq!(attributor.label(&talk, &silence, &talk), UNKNOWN_LABEL);
        attributor.observe(&talk);
        attributor.observe(&talk);
        assert_eq!(attributor.label(&talk, &silence, &talk), SELF_LABEL);
        assert_eq!(attributor.label(&silence, &talk, &talk), UNKNOWN_LABEL);
    }

    #[test]
    fn test_attributor_without_system_audio_never_says_you() {
        // A meeting app is on the mic, but system audio capture failed, so
        // remote voices reach us only through the mic.
        let mut attributor = SpeakerAttributor::new(None, true);
        let talk = vec![0.1f32; 320];
        assert_eq!(attributor.label(&talk, &[], &talk), UNKNOWN_LABEL);
    }

    #[test]
    fn test_models_not_available_in_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!DiarizationEngine::models_available_in(tmp.path()));
    }
}
