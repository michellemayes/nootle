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
    centroids, classify, cluster_voices, cosine_similarity, is_automatic_label, speaker_label,
    DiarizationEngine, Source, SpeakerAttributor, OFFLINE_SIMILARITY, SELF_LABEL, UNKNOWN_LABEL,
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
                let (from, to) = (segment.start_ms, segment.end_ms);
                let speaker = self.speakers.label(
                    span(&self.mic, self.base, from, to),
                    span(&self.system, self.base, from, to),
                    span(&self.mixed, self.base, from, to),
                );
                Sentence { segment, speaker }
            })
            .collect()
    }
}

/// The part of `audio` (which starts at sample `base`) between two times.
fn span(audio: &[f32], base: usize, from_ms: u64, to_ms: u64) -> &[f32] {
    let index = |ms: u64| {
        (ms as usize * SAMPLES_PER_MS)
            .saturating_sub(base)
            .min(audio.len())
    };
    let (start, end) = (index(from_ms), index(to_ms));
    &audio[start..end.max(start)]
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
    let new: Vec<NewTranscriptSegment> = sentences
        .iter()
        .map(|s| NewTranscriptSegment {
            meeting_id: meeting_id.to_string(),
            speaker_label: s.speaker.clone(),
            text: dictionary.apply(&s.segment.text),
            start_ms: i64::try_from(s.segment.start_ms).unwrap_or(i64::MAX),
            end_ms: i64::try_from(s.segment.end_ms).unwrap_or(i64::MAX),
            confidence: f64::from(s.segment.confidence),
        })
        .collect();
    db.create_transcript_segments(new).unwrap_or_else(|e| {
        tracing::error!("Failed to store transcript segments: {e}");
        Vec::new()
    })
}

/// How much audio is fed to the transcriber at a time when reading a file.
const FILE_CHUNK_SAMPLES: usize = SAMPLE_RATE as usize * 2;

/// A recording on disk, read from its stems file (mic left, system right)
/// when there is one, else from the mono mix.
struct Recording {
    reader: hound::WavReader<std::io::BufReader<std::fs::File>>,
    stereo: bool,
    mixer: AudioMixer,
}

impl Recording {
    /// Opens a recording, first repairing headers a crash left stale so
    /// every sample on disk is readable.
    fn open(audio_path: &Path) -> Result<Self> {
        let stems = stems_path(audio_path);
        for path in [audio_path, stems.as_path()] {
            if path.exists() {
                if let Err(e) = repair_wav_header(path) {
                    tracing::warn!("Couldn't repair {}: {e:#}", path.display());
                }
            }
        }
        let path = if stems.exists() {
            stems.as_path()
        } else {
            audio_path
        };
        let reader = hound::WavReader::open(path)
            .with_context(|| format!("Couldn't read {}", path.display()))?;
        let stereo = reader.spec().channels == 2;
        Ok(Self {
            reader,
            stereo,
            mixer: AudioMixer::new(),
        })
    }

    /// The next `frames` of audio; shorter at the end of the file.
    fn read(&mut self, frames: usize) -> AudioChunk {
        let channels = if self.stereo { 2 } else { 1 };
        let samples: Vec<f32> = self
            .reader
            .samples::<i16>()
            .take(frames * channels)
            // A torn tail from a crash: keep what decoded.
            .map_while(Result::ok)
            .map(|v| v as f32 / 32768.0)
            .collect();
        if !self.stereo {
            return AudioChunk {
                mixed: samples,
                mic: Vec::new(),
                system: Vec::new(),
            };
        }
        let mic: Vec<f32> = samples.iter().step_by(2).copied().collect();
        let system: Vec<f32> = samples.iter().skip(1).step_by(2).copied().collect();
        AudioChunk {
            mixed: self.mixer.mix(&system, &mic),
            mic,
            system,
        }
    }

    /// The audio between two times.
    fn span(&mut self, start_ms: i64, end_ms: i64) -> Result<AudioChunk> {
        let start = start_ms.max(0) as u32 * SAMPLES_PER_MS as u32;
        self.reader.seek(start.min(self.reader.duration()))?;
        Ok(self.read((end_ms - start_ms).max(0) as usize * SAMPLES_PER_MS))
    }
}

/// Transcribes a recording already on disk from scratch, replacing any
/// transcript the meeting has, e.g. to recover a meeting whose live
/// transcription a crash cut short. Uses the separate mic/system stems when
/// they exist so the user is told apart from the call; remote speakers are
/// left for [`rediarize`] to name. Calls `on_stored` with each batch of new
/// segments; returns the recording's length in ms and the number of
/// segments.
pub fn transcribe_file(
    db: &Database,
    meeting_id: &str,
    audio_path: &Path,
    mut on_stored: impl FnMut(&[TranscriptSegment]),
) -> Result<(u64, u64)> {
    let mut recording = Recording::open(audio_path)?;
    let engine = TranscriptionEngine::load().context("Transcription model failed to load")?;
    let mut transcriber = LiveTranscriber::new(engine, SpeakerAttributor::new(None, false));
    db.delete_transcript(meeting_id)?;
    let (mut total_samples, mut count) = (0u64, 0u64);
    loop {
        let chunk = recording.read(FILE_CHUNK_SAMPLES);
        let len = chunk.mixed.len();
        total_samples += len as u64;
        let sentences = if len == 0 {
            transcriber.finish()
        } else {
            transcriber.push(chunk)
        };
        let stored = store(db, meeting_id, &sentences);
        count += stored.len() as u64;
        on_stored(&stored);
        if len == 0 {
            break;
        }
    }
    Ok((total_samples * 1000 / SAMPLE_RATE as u64, count))
}

/// A sentence needs this much audio to anchor a speaker in clustering;
/// shorter ones join whichever speaker their voice is closest to.
const MIN_ANCHOR_MS: i64 = 1_500;
/// Remote speech in this many sentences shows the recording was a call.
const CALL_EVIDENCE_SENTENCES: usize = 3;

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
        || !audio_path.exists()
    {
        return Ok(false);
    }
    let Ok(mut engine) = DiarizationEngine::load() else {
        return Ok(false);
    };
    let mut recording = Recording::open(audio_path)?;

    // First pass: how loud each side is per sentence, which tells whether
    // this was a call and who's on which side. Audio is read again in the
    // second pass rather than holding a whole meeting in memory.
    let mut levels = Vec::with_capacity(segments.len());
    for seg in &segments {
        let a = recording.span(seg.start_ms, seg.end_ms)?;
        levels.push((rms(&a.mic), rms(&a.system)));
    }
    let in_call = recording.stereo
        && levels
            .iter()
            .filter(|(_, system)| *system > crate::diarization::SPEECH_RMS)
            .count()
            >= CALL_EVIDENCE_SENTENCES;

    let mut sources = Vec::with_capacity(segments.len());
    let mut voices: Vec<Option<Vec<f32>>> = Vec::with_capacity(segments.len());
    for (seg, &(mic, system)) in segments.iter().zip(&levels) {
        let source = classify(in_call, mic, system);
        let voice = match source {
            Source::Local => None,
            Source::Remote => {
                engine.voice_embedding(&recording.span(seg.start_ms, seg.end_ms)?.system)?
            }
            Source::Room => {
                engine.voice_embedding(&recording.span(seg.start_ms, seg.end_ms)?.mixed)?
            }
        };
        sources.push(source);
        voices.push(voice);
    }

    let (labels, speaker_voices) = assign_speakers(&segments, &sources, &voices, |centroids| {
        crate::voices::recognize(db, centroids)
    });
    crate::voices::remember_meeting_voices(db, meeting_id, &speaker_voices);
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
/// all, the previous remote speaker). `recognize` may put a remembered name
/// on each cluster; the rest are numbered "Speaker 1", "Speaker 2", … in
/// order of first appearance. Also returns each label's voice.
fn assign_speakers(
    segments: &[TranscriptSegment],
    sources: &[Source],
    voices: &[Option<Vec<f32>>],
    recognize: impl FnOnce(&[Vec<f32>]) -> Vec<Option<String>>,
) -> (Vec<String>, Vec<(String, Vec<f32>)>) {
    let anchors: Vec<(usize, &[f32])> = (0..segments.len())
        .filter(|&i| segments[i].end_ms - segments[i].start_ms >= MIN_ANCHOR_MS)
        .filter_map(|i| Some((i, voices[i].as_deref()?)))
        .collect();
    let anchor_voices: Vec<&[f32]> = anchors.iter().map(|&(_, v)| v).collect();
    let clusters = cluster_voices(&anchor_voices, OFFLINE_SIMILARITY);
    let mut cluster_of = vec![None; segments.len()];
    for (&(i, _), &c) in anchors.iter().zip(&clusters) {
        cluster_of[i] = Some(c);
    }
    let centroids = centroids(&anchor_voices, &clusters);
    let mut names = recognize(&centroids);
    names.resize(centroids.len(), None);
    let mut next_number = 0;
    let cluster_labels: Vec<String> = names
        .into_iter()
        .map(|name| {
            name.unwrap_or_else(|| {
                next_number += 1;
                speaker_label(next_number - 1)
            })
        })
        .collect();

    let closest = |v: &[f32]| -> Option<usize> {
        centroids
            .iter()
            .map(|c| cosine_similarity(c, v))
            .enumerate()
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
            Some(c) => cluster_labels[c].clone(),
            None => UNKNOWN_LABEL.to_string(),
        });
    }
    (labels, cluster_labels.into_iter().zip(centroids).collect())
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
        let (labels, speakers) = assign_speakers(&segments, &sources, &voices, |_| vec![]);
        assert_eq!(
            labels,
            [
                "Speaker 1",
                "You",
                "Speaker 2",
                "Speaker 1",
                "Speaker 1",
                "Speaker 1"
            ]
        );
        assert_eq!(speakers.len(), 2);
        assert_eq!(speakers[0].0, "Speaker 1");
    }

    #[test]
    fn remembered_voices_name_their_cluster() {
        let segments = [seg(0, 3000), seg(3000, 6000)];
        let sources = [Source::Remote, Source::Remote];
        let voices = [Some(vec![1.0, 0.0]), Some(vec![0.0, 1.0])];
        let (labels, _) = assign_speakers(&segments, &sources, &voices, |centroids| {
            assert_eq!(centroids.len(), 2);
            vec![None, Some("Priya".into())]
        });
        assert_eq!(labels, ["Speaker 1", "Priya"]);
    }

    #[test]
    fn without_voices_everyone_is_speaker() {
        let segments = [seg(0, 1000), seg(1000, 2000)];
        let sources = [Source::Room, Source::Room];
        let (labels, speakers) = assign_speakers(&segments, &sources, &[None, None], |_| vec![]);
        assert_eq!(labels, ["Speaker", "Speaker"]);
        assert!(speakers.is_empty());
    }
}
