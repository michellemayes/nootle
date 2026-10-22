//! Voice activity detection and utterance endpointing.
//!
//! Parakeet transcribes best one utterance at a time: cut mid-word and the
//! words at the cut are lost, feed it more than ~20 s and it starts dropping
//! whole sentences. So audio is split where people pause, found with Silero
//! VAD (or, until that model is downloaded, a simple energy detector).

use anyhow::{Context, Result};
use ort::session::Session;
use ort::value::Tensor;

use crate::audio::SAMPLE_RATE;

/// Silero VAD scores 32 ms frames at 16 kHz.
pub const FRAME_SAMPLES: usize = 512;
const FRAME_MS: usize = FRAME_SAMPLES * 1000 / SAMPLE_RATE as usize;
/// Silero v5 expects the last 64 samples of the previous frame prepended.
const CONTEXT_SAMPLES: usize = 64;
/// Downloaded with the transcription model, into its folder.
pub const MODEL_FILE: &str = "silero_vad.onnx";

/// Scores how likely each 32 ms frame is to be speech.
pub enum VoiceDetector {
    Silero(SileroVad),
    Energy(EnergyVad),
}

impl VoiceDetector {
    /// Silero when its model is downloaded and loads, otherwise the energy
    /// detector.
    pub fn load() -> Self {
        if SileroVad::is_available() {
            match SileroVad::load() {
                Ok(vad) => return Self::Silero(vad),
                Err(e) => tracing::warn!("Silero VAD failed to load, using energy VAD: {e:#}"),
            }
        }
        Self::Energy(EnergyVad::default())
    }

    /// Speech probability of one `FRAME_SAMPLES` frame.
    pub fn speech_prob(&mut self, frame: &[f32]) -> f32 {
        match self {
            Self::Silero(vad) => vad.speech_prob(frame).unwrap_or_else(|e| {
                tracing::warn!("Silero VAD failed: {e:#}");
                0.0
            }),
            Self::Energy(vad) => vad.speech_prob(frame),
        }
    }
}

pub struct SileroVad {
    session: Session,
    state: Vec<f32>,
    /// The model's input: the previous frame's last samples, then this frame.
    input: Vec<f32>,
}

impl SileroVad {
    fn model_path() -> std::path::PathBuf {
        crate::transcription::TranscriptionEngine::model_dir().join(MODEL_FILE)
    }

    pub fn is_available() -> bool {
        Self::model_path().exists()
    }

    pub fn load() -> Result<Self> {
        let path = Self::model_path();
        // A tiny recurrent model: CPU beats the CoreML hand-off per frame.
        let session = Session::builder()?
            .commit_from_file(&path)
            .context("Failed to load Silero VAD")?;
        Ok(Self {
            session,
            state: vec![0.0; 2 * 128],
            input: vec![0.0; CONTEXT_SAMPLES + FRAME_SAMPLES],
        })
    }

    fn speech_prob(&mut self, frame: &[f32]) -> Result<f32> {
        // Slide the last frame's tail into the context slot, then the new
        // frame (zero-padded if short) after it.
        self.input.copy_within(FRAME_SAMPLES.., 0);
        let fresh = &mut self.input[CONTEXT_SAMPLES..];
        let n = frame.len().min(FRAME_SAMPLES);
        fresh[..n].copy_from_slice(&frame[..n]);
        fresh[n..].fill(0.0);

        let outputs = self.session.run(ort::inputs![
            "input" => Tensor::from_array(([1_usize, self.input.len()], self.input.clone()))?,
            "state" => Tensor::from_array(([2_usize, 1, 128], self.state.clone()))?,
            "sr" => Tensor::from_array(((), vec![SAMPLE_RATE as i64]))?,
        ])?;
        let (_, prob) = outputs["output"].try_extract_tensor::<f32>()?;
        let (_, state) = outputs["stateN"].try_extract_tensor::<f32>()?;
        let n = self.state.len();
        self.state.copy_from_slice(&state[..n]);
        Ok(prob.first().copied().unwrap_or(0.0))
    }
}

/// Fallback detector: speech is anything well above the room's noise floor,
/// which it tracks as the quietest recent level.
pub struct EnergyVad {
    noise_floor: f32,
}

impl Default for EnergyVad {
    fn default() -> Self {
        Self { noise_floor: 1e-3 }
    }
}

impl EnergyVad {
    fn speech_prob(&mut self, frame: &[f32]) -> f32 {
        let level = crate::audio::rms(frame).max(1e-6);
        // Falls to a quieter level at once, rises slowly (~10 s) so speech
        // never becomes the new floor.
        self.noise_floor = if level < self.noise_floor {
            level
        } else {
            self.noise_floor * 0.997 + level * 0.003
        };
        let snr_db = 20.0 * (level / self.noise_floor.max(1e-4)).log10();
        ((snr_db - 6.0) / 6.0).clamp(0.0, 1.0)
    }
}

/// Above this a frame is speech; an utterance ends once frames stay below
/// `END_THRESHOLD`. The gap between them stops flicker from splitting words.
const START_THRESHOLD: f32 = 0.5;
const END_THRESHOLD: f32 = 0.35;
/// A pause this long ends an utterance.
const MIN_SILENCE_MS: usize = 500;
/// Shorter bursts (a cough, a click) are dropped.
const MIN_SPEECH_MS: usize = 250;
/// Audio kept either side of the speech so first and last sounds survive.
const PAD_MS: usize = 200;
/// Past this an utterance is cut at its quietest recent moment, keeping each
/// piece well inside what Parakeet transcribes reliably.
const MAX_UTTERANCE_MS: usize = 15_000;
/// How far back from the limit to look for that quiet moment.
const SPLIT_SEARCH_MS: usize = 4_000;

/// An utterance as a range of samples from the start of the stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Utterance {
    pub start: usize,
    pub end: usize,
}

/// Turns per-frame speech probabilities into utterances, frame by frame, so
/// it works the same on a live stream and a finished recording.
#[derive(Default)]
pub struct Endpointer {
    frames_seen: usize,
    /// First frame of the utterance in progress.
    speech_start: Option<usize>,
    last_speech: usize,
    /// Probabilities of the utterance in progress, for picking a split.
    probs: Vec<f32>,
    /// The utterance in progress continues one cut at the length limit, so
    /// its start isn't padded back into audio the previous piece already has.
    continues_split: bool,
    /// End frame of the last utterance handed out. Padding never reaches
    /// back past it, so no audio is repeated or needed again once released.
    floor: usize,
}

impl Endpointer {
    /// Feed the next frame's probability; returns an utterance when one ends.
    pub fn push(&mut self, prob: f32) -> Option<Utterance> {
        let frame = self.frames_seen;
        self.frames_seen += 1;

        let Some(start) = self.speech_start else {
            if prob >= START_THRESHOLD {
                self.speech_start = Some(frame);
                self.last_speech = frame;
                self.probs = vec![prob];
                self.continues_split = false;
            }
            return None;
        };
        self.probs.push(prob);
        if prob >= END_THRESHOLD {
            self.last_speech = frame;
        }

        if (frame - self.last_speech) * FRAME_MS >= MIN_SILENCE_MS {
            self.speech_start = None;
            return self.finish(start, self.last_speech + 1);
        }
        if (frame + 1 - start) * FRAME_MS >= MAX_UTTERANCE_MS {
            // Split at the least speech-like frame near the end, and carry
            // on from there as a new utterance.
            let search = (SPLIT_SEARCH_MS / FRAME_MS).min(self.probs.len() - 1);
            let from = self.probs.len() - search;
            let split = (from..self.probs.len())
                .min_by(|&a, &b| self.probs[a].total_cmp(&self.probs[b]))
                .unwrap_or(self.probs.len() - 1);
            let end = start + split;
            self.probs.drain(..split);
            self.speech_start = Some(end);
            let piece = self.span(start, end, !self.continues_split, false);
            self.continues_split = true;
            return Some(piece);
        }
        None
    }

    /// The earliest sample a future utterance can include. Audio before it
    /// will never be needed again.
    pub fn retain_from(&self) -> usize {
        let frame = match self.speech_start {
            Some(start) if self.continues_split => start,
            Some(start) => start.saturating_sub(PAD_MS / FRAME_MS),
            None => self.frames_seen.saturating_sub(PAD_MS / FRAME_MS),
        };
        frame.max(self.floor) * FRAME_SAMPLES
    }

    /// End of stream: the utterance in progress, if any.
    pub fn flush(&mut self) -> Option<Utterance> {
        let start = self.speech_start.take()?;
        self.finish(start, self.last_speech + 1)
    }

    fn finish(&mut self, start: usize, end: usize) -> Option<Utterance> {
        self.probs.clear();
        // Only silence followed the last cut: nothing is left to transcribe.
        if end <= start {
            return None;
        }
        let long_enough = self.continues_split || (end - start) * FRAME_MS >= MIN_SPEECH_MS;
        long_enough.then(|| self.span(start, end, !self.continues_split, true))
    }

    /// Sample range for frames `start..end`, padded on the sides that meet
    /// silence. A side cut mid-speech isn't padded: that would repeat audio
    /// in both pieces.
    fn span(&mut self, start: usize, end: usize, pad_start: bool, pad_end: bool) -> Utterance {
        let pad = PAD_MS / FRAME_MS;
        let start = if pad_start {
            start.saturating_sub(pad).max(self.floor)
        } else {
            start
        };
        let end = if pad_end { end + pad } else { end }.min(self.frames_seen);
        self.floor = end;
        Utterance {
            start: start * FRAME_SAMPLES,
            end: end * FRAME_SAMPLES,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(probs: &[f32]) -> Vec<Utterance> {
        let mut e = Endpointer::default();
        let mut out: Vec<Utterance> = probs.iter().filter_map(|&p| e.push(p)).collect();
        out.extend(e.flush());
        out
    }

    fn frames(ms: usize) -> usize {
        ms / FRAME_MS
    }

    #[test]
    fn finds_an_utterance_between_pauses() {
        let mut probs = vec![0.0; frames(1000)];
        probs.extend(vec![0.9; frames(2000)]);
        probs.extend(vec![0.0; frames(1000)]);
        let found = run(&probs);
        assert_eq!(found.len(), 1);
        let pad = PAD_MS / FRAME_MS;
        assert_eq!(found[0].start, (frames(1000) - pad) * FRAME_SAMPLES);
        assert_eq!(found[0].end, (frames(3000) + pad) * FRAME_SAMPLES);
    }

    #[test]
    fn short_pauses_do_not_split_and_long_ones_do() {
        let mut probs = vec![0.9; frames(1000)];
        probs.extend(vec![0.1; frames(200)]); // breath
        probs.extend(vec![0.9; frames(1000)]);
        probs.extend(vec![0.1; frames(800)]); // turn change
        probs.extend(vec![0.9; frames(1000)]);
        assert_eq!(run(&probs).len(), 2);
    }

    #[test]
    fn drops_clicks() {
        let mut probs = vec![0.0; frames(500)];
        probs.extend(vec![0.9; 2]);
        probs.extend(vec![0.0; frames(1000)]);
        assert!(run(&probs).is_empty());
    }

    #[test]
    fn caps_long_monologues_at_a_quiet_moment() {
        let mut probs = vec![0.9; frames(40_000)];
        let dip = frames(13_000);
        probs[dip] = 0.4;
        let found = run(&probs);
        assert!(found.len() >= 3, "{found:?}");
        assert_eq!(found[0].end, dip * FRAME_SAMPLES);
        for pair in found.windows(2) {
            assert_eq!(pair[1].start, pair[0].end, "no audio lost or repeated");
        }
        for u in &found {
            assert!((u.end - u.start) / FRAME_SAMPLES * FRAME_MS <= MAX_UTTERANCE_MS + PAD_MS);
        }
    }

    /// Speech that falls silent just before the length limit, so the cut
    /// lands in the pause: frames 0..=453 are speech, then quieter and
    /// quieter silence until the limit at frame 468.
    fn speech_cut_in_its_trailing_pause() -> Vec<f32> {
        let limit = MAX_UTTERANCE_MS.div_ceil(FRAME_MS);
        let mut probs = vec![0.9; limit - 15];
        probs.extend(vec![0.2; 14]);
        probs.push(0.0);
        assert_eq!(probs.len(), limit);
        probs
    }

    // Found by formal/tla/Endpointer.tla (NotInverted).
    #[test]
    fn a_cut_followed_only_by_silence_is_not_an_utterance() {
        let mut probs = speech_cut_in_its_trailing_pause();
        probs.extend(vec![0.0; frames(1000)]);
        let found = run(&probs);
        for u in &found {
            assert!(u.end > u.start, "backwards or empty utterance: {found:?}");
        }
        assert_eq!(found.len(), 1, "{found:?}");
    }

    // Found by formal/tla/Endpointer.tla (RetainHonoured): the pipeline
    // drops audio before retain_from(), so a later utterance must not start
    // before a value it already returned.
    #[test]
    fn retain_from_never_takes_back_audio_it_released() {
        let mut probs = speech_cut_in_its_trailing_pause();
        probs.extend(vec![0.0; 1]);
        probs.extend(vec![0.9; frames(1000)]);
        probs.extend(vec![0.0; frames(1000)]);
        let mut e = Endpointer::default();
        let mut released = 0;
        let mut found = Vec::new();
        for &p in &probs {
            if let Some(u) = e.push(p) {
                found.push(u);
                if u.end > u.start {
                    assert!(
                        u.start >= released,
                        "{u:?} starts before released sample {released}"
                    );
                }
            }
            released = released.max(e.retain_from());
        }
        assert_eq!(found.iter().filter(|u| u.end > u.start).count(), 2);
    }

    #[test]
    fn energy_vad_tells_speech_from_room_noise() {
        let mut vad = EnergyVad::default();
        let noise: Vec<f32> = (0..FRAME_SAMPLES)
            .map(|i| ((i * 7919) % 13) as f32 * 1e-4)
            .collect();
        for _ in 0..50 {
            vad.speech_prob(&noise);
        }
        assert!(vad.speech_prob(&noise) < 0.2);
        let speech: Vec<f32> = (0..FRAME_SAMPLES)
            .map(|i| (i as f32 * 0.05).sin() * 0.2)
            .collect();
        assert!(vad.speech_prob(&speech) > 0.8);
    }
}
