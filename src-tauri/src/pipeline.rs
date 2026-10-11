//! From recorded audio to a stored, speaker-labelled transcript.
//!
//! While recording, audio arrives in ~2 s chunks. Voice activity detection
//! finds where each utterance starts and ends; every finished utterance is
//! transcribed whole and split into sentences, and each sentence is labelled
//! with who said it. Whole utterances keep words intact that fixed 2 s
//! windows used to cut in half.
//!
//! After the meeting, [`rediarize`] labels speakers again with the whole
//! recording in hand: every sentence's voice is compared with every other,
//! which tells speakers apart far better than the live pass could while it
//! only knew the last few seconds.

use std::path::Path;

use anyhow::{Context, Result};

use crate::audio::writer::{repair_wav_header, stems_path};
use crate::audio::{rms, AudioChunk, AudioMixer, SAMPLE_RATE};
use crate::db::{Database, NewTranscriptSegment, TranscriptSegment};
use crate::diarization::{
    classify, cluster_voices, is_automatic_label, speaker_label, DiarizationEngine, Source,
    SpeakerAttributor, OFFLINE_SIMILARITY, SELF_LABEL, UNKNOWN_LABEL,
};
use crate::transcription::{TranscriptionEngine, TranscriptionSegment};
use crate::vad::{Endpointer, Utterance, VoiceDetector, FRAME_SAMPLES};

const SAMPLES_PER_MS: usize = SAMPLE_RATE as usize / 1000;

/// A transcribed sentence and who said it.
#[derive(Debug, Clone)]
pub struct Sentence {
    pub segment: TranscriptionSegment,
    pub speaker: String,
}

/// Transcribes a stream of audio chunks utterance by utterance.
pub struct LiveTranscriber {
    engine: TranscriptionEngine,
    vad: VoiceDetector,
    endpointer: Endpointer,
    speakers: SpeakerAttributor,
    /// Audio from sample `base` onwards. `mic` and `system` are empty when
    /// the sources aren't known separately (an imported file).
    mixed: Vec<f32>,
    mic: Vec<f32>,
    system: Vec<f32>,
    base: usize,
    /// Samples scored by the VAD so far.
    scored: usize,
}

impl LiveTranscriber {
    pub fn new(engine: TranscriptionEngine, speakers: SpeakerAttributor) -> Self {
        Self {
            engine,
            vad: VoiceDetector::load(),
            endpointer: Endpointer::default(),
            speakers,
            mixed: Vec::new(),
            mic: Vec::new(),
            system: Vec::new(),
            base: 0,
            scored: 0,
        }
    }

    /// Adds the next chunk of audio; returns the sentences of any utterance
    /// it completed.
    pub fn push(&mut self, chunk: AudioChunk) -> Vec<Sentence> {
        self.speakers.observe(&chunk.system);
        let separate = chunk.mic.len() == chunk.mixed.len()
            && chunk.system.len() == chunk.mixed.len()
            && self.mic.len() == self.mixed.len();
        if separate {
            self.mic.extend_from_slice(&chunk.mic);
            self.system.extend_from_slice(&chunk.system);
        } else {
            self.mic.clear();
            self.system.clear();
        }
        self.mixed.extend_from_slice(&chunk.mixed);

        let mut finished = Vec::new();
        while self.scored + FRAME_SAMPLES <= self.base + self.mixed.len() {
            let at = self.scored - self.base;
            let prob = self.vad.speech_prob(&self.mixed[at..at + FRAME_SAMPLES]);
            self.scored += FRAME_SAMPLES;
            if let Some(utterance) = self.endpointer.push(prob) {
                finished.push(utterance);
            }
        }
        let sentences = finished
            .into_iter()
            .flat_map(|u| self.transcribe(u))
            .collect();

        let keep_from = self.endpointer.retain_from().min(self.scored);
        let drop = keep_from.saturating_sub(self.base).min(self.mixed.len());
        self.mixed.drain(..drop);
        if !self.mic.is_empty() {
            self.mic.drain(..drop);
            self.system.drain(..drop);
        }
        self.base += drop;
        sentences
    }

    /// End of the stream: transcribes the utterance still in progress.
    pub fn finish(&mut self) -> Vec<Sentence> {
        match self.endpointer.flush() {
            Some(u) => self.transcribe(u),
            None => Vec::new(),
        }
    }

    fn transcribe(&mut self, utterance: Utterance) -> Vec<Sentence> {
        let start = utterance
            .start
            .saturating_sub(self.base)
            .min(self.mixed.len());
        let end = utterance
            .end
            .saturating_sub(self.base)
            .min(self.mixed.len());
        if end <= start {
            return Vec::new();
        }
        let offset_ms = (utterance.start.max(self.base) / SAMPLES_PER_MS) as u64;
        let segments = match self.engine.transcribe(&self.mixed[start..end], offset_ms) {
            Ok(segments) => segments,
            Err(e) => {
                tracing::error!("Transcription failed at {offset_ms} ms: {e:#}");
                return Vec::new();
            }
        };
        segments
            .into_iter()
            .map(|segment| {
                // The sentence's own audio decides who said it, so a reply
                // that follows without a pause still gets its own speaker.
                let span = |v: &[f32]| -> Vec<f32> {
                    if v.is_empty() {
                        return Vec::new();
                    }
                    let to_index = |ms: u64| {
                        (ms as usize * SAMPLES_PER_MS)
                            .saturating_sub(self.base)
                            .min(v.len())
                    };
                    let (s, e) = (to_index(segment.start_ms), to_index(segment.end_ms));
                    v[s..e.max(s)].to_vec()
                };
                let (mic, system, mixed) = (span(&self.mic), span(&self.system), span(&self.mixed));
                let speaker = self.speakers.label(&mic, &system, &mixed);
                Sentence { segment, speaker }
            })
            .collect()
    }
}

/// Builds the transcriber for a new recording: the transcription model
/// (required), plus speaker identification when its models are downloaded.
/// `in_call`: a meeting app is already using the mic.
pub fn live_transcriber(in_call: bool) -> Result<LiveTranscriber> {
    let engine = TranscriptionEngine::load().context("Transcription model failed to load")?;
    let diarization = match DiarizationEngine::load() {
        Ok(e) => Some(e),
        Err(err) => {
            tracing::info!("Diarization models not available, skipping: {err}");
            None
        }
    };
    Ok(LiveTranscriber::new(
        engine,
        SpeakerAttributor::new(diarization, in_call),
    ))
}

/// Stores sentences as transcript segments, applying the user's dictionary.
pub fn store(db: &Database, meeting_id: &str, sentences: &[Sentence]) -> Vec<TranscriptSegment> {
    if sentences.is_empty() {
        return Vec::new();
    }
    // Reloaded per batch so words added mid-meeting apply straight away.
    let dictionary =
        crate::dictionary::Rules::new(&db.list_dictionary_entries().unwrap_or_default());
    sentences
        .iter()
        .filter_map(|s| {
            db.create_transcript_segment(NewTranscriptSegment {
                meeting_id: meeting_id.to_string(),
                speaker_label: s.speaker.clone(),
                text: dictionary.apply(&s.segment.text),
                start_ms: i64::try_from(s.segment.start_ms).unwrap_or(i64::MAX),
                end_ms: i64::try_from(s.segment.end_ms).unwrap_or(i64::MAX),
                confidence: f64::from(s.segment.confidence),
            })
            .map_err(|e| tracing::error!("Failed to store transcript segment: {e}"))
            .ok()
        })
        .collect()
}

/// How much audio is fed to the transcriber at a time when reading a file.
const FILE_CHUNK_SAMPLES: usize = SAMPLE_RATE as usize * 2;

/// Transcribes a recording already on disk from scratch, replacing any
/// transcript the meeting has, e.g. to recover a meeting whose live
/// transcription a crash cut short. Uses the separate mic/system stems when
/// they exist so the user is told apart from the call. Calls `on_stored`
/// with each batch of new segments; returns the recording's length in ms
/// and the number of segments.
pub fn transcribe_file(
    db: &Database,
    meeting_id: &str,
    audio_path: &Path,
    mut on_stored: impl FnMut(&[TranscriptSegment]),
) -> Result<(u64, u64)> {
    let stems = stems_path(audio_path);
    let source = if stems.exists() { &stems } else { audio_path };
    if let Err(e) = repair_wav_header(source) {
        tracing::warn!("Couldn't repair {}: {e:#}", source.display());
    }
    let mut reader = hound::WavReader::open(source)
        .with_context(|| format!("Couldn't read {}", source.display()))?;
    let channels = reader.spec().channels as usize;

    let mut transcriber = live_transcriber(false)?;
    db.delete_transcript(meeting_id)?;
    let mixer = AudioMixer::new();
    let mut samples = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0));
    let (mut total_samples, mut count) = (0u64, 0u64);
    loop {
        let mut interleaved = Vec::with_capacity(FILE_CHUNK_SAMPLES * channels);
        for sample in samples.by_ref().take(FILE_CHUNK_SAMPLES * channels) {
            match sample {
                Ok(v) => interleaved.push(v),
                // A torn tail from the crash: keep what decoded.
                Err(_) => break,
            }
        }
        if interleaved.is_empty() {
            break;
        }
        let chunk = if channels == 2 {
            let mic: Vec<f32> = interleaved.iter().step_by(2).copied().collect();
            let system: Vec<f32> = interleaved.iter().skip(1).step_by(2).copied().collect();
            AudioChunk {
                mixed: mixer.mix(&system, &mic),
                mic,
                system,
            }
        } else {
            AudioChunk {
                mixed: interleaved,
                mic: Vec::new(),
                system: Vec::new(),
            }
        };
        total_samples += chunk.mixed.len() as u64;
        let last = chunk.mixed.len() < FILE_CHUNK_SAMPLES;
        let stored = store(db, meeting_id, &transcriber.push(chunk));
        count += stored.len() as u64;
        on_stored(&stored);
        if last {
            break;
        }
    }
    let stored = store(db, meeting_id, &transcriber.finish());
    count += stored.len() as u64;
    on_stored(&stored);
    Ok((total_samples * 1000 / SAMPLE_RATE as u64, count))
}

/// A sentence needs this much audio to anchor a speaker in clustering;
/// shorter ones join whichever speaker their voice is closest to.
const MIN_ANCHOR_MS: u64 = 1_500;
/// Remote speech in this many sentences shows the recording was a call.
const CALL_EVIDENCE_SENTENCES: usize = 3;

/// Reads spans of a recording, from the stems file when there is one.
struct RecordingReader {
    reader: hound::WavReader<std::io::BufReader<std::fs::File>>,
    stereo: bool,
}

/// The audio of one span: separate sources when known, and the mix.
struct SpanAudio {
    mic: Vec<f32>,
    system: Vec<f32>,
    mixed: Vec<f32>,
}

impl RecordingReader {
    fn open(audio_path: &Path) -> Result<Self> {
        let stems = stems_path(audio_path);
        let path = if stems.exists() {
            stems
        } else {
            audio_path.to_path_buf()
        };
        let reader = hound::WavReader::open(&path)
            .with_context(|| format!("Couldn't read {}", path.display()))?;
        let stereo = reader.spec().channels == 2;
        Ok(Self { reader, stereo })
    }

    fn span(&mut self, start_ms: i64, end_ms: i64) -> Result<SpanAudio> {
        let start = start_ms.max(0) as u32 * SAMPLES_PER_MS as u32;
        let frames = (end_ms - start_ms).max(0) as usize * SAMPLES_PER_MS;
        self.reader.seek(start.min(self.reader.duration()))?;
        let channels = if self.stereo { 2 } else { 1 };
        let samples: Vec<f32> = self
            .reader
            .samples::<i16>()
            .take(frames * channels)
            .filter_map(|s| s.ok())
            .map(|v| v as f32 / 32768.0)
            .collect();
        Ok(if self.stereo {
            let mic: Vec<f32> = samples.iter().step_by(2).copied().collect();
            let system: Vec<f32> = samples.iter().skip(1).step_by(2).copied().collect();
            let mixed = mic.iter().zip(&system).map(|(m, s)| m + s).collect();
            SpanAudio { mic, system, mixed }
        } else {
            SpanAudio {
                mic: Vec::new(),
                system: Vec::new(),
                mixed: samples,
            }
        })
    }
}

/// Labels the speakers of a finished meeting again, comparing every
/// sentence's voice with every other. Leaves the transcript alone (returns
/// `false`) when the user has already named speakers, or when there's no
/// recording or speaker model to work from.
pub fn rediarize(db: &Database, meeting_id: &str, audio_path: &Path) -> Result<bool> {
    let segments = db.get_transcript(meeting_id)?;
    if segments.is_empty()
        || !segments
            .iter()
            .all(|s| is_automatic_label(&s.speaker_label))
    {
        return Ok(false);
    }
    if !audio_path.exists() {
        return Ok(false);
    }
    let mut engine = match DiarizationEngine::load() {
        Ok(e) => e,
        Err(_) => return Ok(false),
    };
    let mut reader = RecordingReader::open(audio_path)?;

    // Where each sentence came from, and its voice when long enough to tell.
    let mut audio = Vec::with_capacity(segments.len());
    for seg in &segments {
        audio.push(reader.span(seg.start_ms, seg.end_ms)?);
    }
    let in_call = reader.stereo
        && audio
            .iter()
            .filter(|a| rms(&a.system) > crate::diarization::SPEECH_RMS)
            .count()
            >= CALL_EVIDENCE_SENTENCES;
    let mut sources = Vec::with_capacity(segments.len());
    let mut voices: Vec<Option<Vec<f32>>> = Vec::with_capacity(segments.len());
    for a in &audio {
        let source = classify(in_call, rms(&a.mic), rms(&a.system));
        let voice = match source {
            Source::Local => None,
            Source::Remote => engine.voice_embedding(&a.system)?,
            Source::Room => engine.voice_embedding(&a.mixed)?,
        };
        sources.push(source);
        voices.push(voice);
    }

    let labels = assign_speakers(&segments, &sources, &voices);
    let changed: Vec<(String, String)> = segments
        .iter()
        .zip(labels)
        .filter(|(seg, label)| seg.speaker_label != *label)
        .map(|(seg, label)| (seg.id.clone(), label))
        .collect();
    db.relabel_transcript(meeting_id, &changed)?;
    Ok(!changed.is_empty())
}

/// Speaker labels from each sentence's source and voice: the user's own
/// lines are "You"; everyone else is clustered by voice, with sentences too
/// short to anchor a cluster joining the closest one (or, with no voice at
/// all, the previous remote speaker).
fn assign_speakers(
    segments: &[TranscriptSegment],
    sources: &[Source],
    voices: &[Option<Vec<f32>>],
) -> Vec<String> {
    let anchors: Vec<usize> = (0..segments.len())
        .filter(|&i| {
            voices[i].is_some()
                && (segments[i].end_ms - segments[i].start_ms) as u64 >= MIN_ANCHOR_MS
        })
        .collect();
    let anchor_voices: Vec<Vec<f32>> = anchors
        .iter()
        .map(|&i| voices[i].clone().unwrap_or_default())
        .collect();
    let clusters = cluster_voices(&anchor_voices, OFFLINE_SIMILARITY);
    let n_clusters = clusters.iter().max().map_or(0, |m| m + 1);
    let dim = anchor_voices.first().map_or(0, Vec::len);
    let mut centroids = vec![vec![0.0f32; dim]; n_clusters];
    for (v, &c) in anchor_voices.iter().zip(&clusters) {
        for (acc, x) in centroids[c].iter_mut().zip(v) {
            *acc += x;
        }
    }
    let mut cluster_of = vec![None; segments.len()];
    for (&i, &c) in anchors.iter().zip(&clusters) {
        cluster_of[i] = Some(c);
    }

    let closest = |v: &[f32]| -> Option<usize> {
        centroids
            .iter()
            .enumerate()
            .map(|(c, centroid)| (c, centroid.iter().zip(v).map(|(a, b)| a * b).sum::<f32>()))
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(c, _)| c)
    };
    let mut labels = Vec::with_capacity(segments.len());
    let mut previous: Option<usize> = None;
    for i in 0..segments.len() {
        if sources[i] == Source::Local {
            labels.push(SELF_LABEL.to_string());
            continue;
        }
        let cluster = cluster_of[i]
            .or_else(|| voices[i].as_deref().and_then(closest))
            .or(previous);
        previous = cluster.or(previous);
        labels.push(match cluster {
            Some(c) => speaker_label(c),
            None => UNKNOWN_LABEL.to_string(),
        });
    }
    labels
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(start_ms: i64, end_ms: i64) -> TranscriptSegment {
        TranscriptSegment {
            id: format!("s{start_ms}"),
            meeting_id: "m".into(),
            speaker_label: "Speaker".into(),
            text: "hi".into(),
            start_ms,
            end_ms,
            confidence: 1.0,
        }
    }

    #[test]
    fn assigns_you_clusters_and_short_lines() {
        let a = Some(vec![1.0, 0.0]);
        let b = Some(vec![0.0, 1.0]);
        let segments = [
            seg(0, 3000),
            seg(3000, 5000),
            seg(5000, 8000),
            seg(8000, 8400), // too short to anchor, but sounds like A
            seg(8400, 8600), // no voice at all: stays with the last speaker
            seg(9000, 12000),
        ];
        let sources = [
            Source::Remote,
            Source::Local,
            Source::Remote,
            Source::Remote,
            Source::Remote,
            Source::Remote,
        ];
        let voices = [a.clone(), None, b.clone(), Some(vec![0.9, 0.1]), None, a];
        assert_eq!(
            assign_speakers(&segments, &sources, &voices),
            [
                "Speaker 1",
                "You",
                "Speaker 2",
                "Speaker 1",
                "Speaker 1",
                "Speaker 1"
            ]
        );
    }

    #[test]
    fn without_voices_everyone_is_speaker() {
        let segments = [seg(0, 1000), seg(1000, 2000)];
        let sources = [Source::Room, Source::Room];
        assert_eq!(
            assign_speakers(&segments, &sources, &[None, None]),
            ["Speaker", "Speaker"]
        );
    }
}
