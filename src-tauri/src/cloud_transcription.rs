//! Transcription by an OpenAI-compatible endpoint (`/audio/transcriptions`),
//! for recordings the on-device model struggles with.
//!
//! The live transcript is always made on this Mac. When the user has set up
//! a transcription endpoint, the finished recording is sent there and its
//! transcript replaces the live one; speakers are then labelled on this Mac
//! as usual, so names and remembered voices keep working.

use std::io::Cursor;
use std::path::Path;

use anyhow::{bail, Context, Result};
use serde::Deserialize;

use crate::db::{Database, TranscriptSegment};
use crate::diarization::UNKNOWN_LABEL;
use crate::endpoints::{error_message, Endpoint};
use crate::pipeline::Sentence;
use crate::transcription::TranscriptionSegment;

/// Upload limit per request. OpenAI's is 25 MB; staying under 20 leaves room
/// for the form around the audio.
const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;
/// Each piece ends at the quietest moment in its last this many seconds, so
/// words aren't cut in half between pieces.
const SPLIT_SEARCH_SECS: usize = 30;
const SPLIT_FRAME_MS: usize = 100;

/// How long one piece may take to upload and transcribe.
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

/// Transcribes the recording at `audio_path` (16-bit PCM WAV).
pub async fn transcribe(
    endpoint: &Endpoint,
    audio_path: &Path,
) -> Result<Vec<TranscriptionSegment>> {
    let model = endpoint.model()?;
    let path = audio_path.to_path_buf();
    let (pieces, rate) = tokio::task::spawn_blocking(move || read_pieces(&path)).await??;
    let mut verbose = true;
    let mut segments = Vec::new();
    for piece in pieces {
        let offset_ms = piece.start as u64 * 1000 / rate as u64;
        let duration_ms = piece.len as u64 * 1000 / rate as u64;
        let reply = request(endpoint, model, piece.wav, &mut verbose).await?;
        segments.extend(reply.into_segments(offset_ms, duration_ms));
    }
    Ok(segments)
}

/// Checks that the endpoint answers a transcription request, with a second
/// of silence.
pub async fn test(endpoint: &Endpoint) -> Result<()> {
    let rate = crate::audio::SAMPLE_RATE;
    let wav = encode_wav(&vec![0; rate as usize], rate)?;
    request(endpoint, endpoint.model()?, wav, &mut true)
        .await
        .map(drop)
}

/// Sends one piece. `verbose`: ask for timestamps (verbose_json). Models that
/// only offer plain json (gpt-4o-transcribe, for one) refuse that with a 400;
/// then this asks again without, and clears `verbose` so later pieces don't
/// try it again.
async fn request(
    endpoint: &Endpoint,
    model: &str,
    wav: Vec<u8>,
    verbose: &mut bool,
) -> Result<Reply> {
    if *verbose {
        if let Some(reply) = send(endpoint, model, wav.clone(), true).await? {
            return Ok(reply);
        }
        *verbose = false;
    }
    send(endpoint, model, wav, false)
        .await?
        .context("The transcription endpoint refused the request")
}

/// `None` when a verbose request was refused with a 400.
async fn send(
    endpoint: &Endpoint,
    model: &str,
    wav: Vec<u8>,
    verbose: bool,
) -> Result<Option<Reply>> {
    let file = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;
    let form = reqwest::multipart::Form::new()
        .part("file", file)
        .text("model", model.to_string());
    let form = if verbose {
        form.text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "segment")
    } else {
        form.text("response_format", "json")
    };
    let request = crate::http::CLIENT
        .post(endpoint.url("audio/transcriptions"))
        .timeout(REQUEST_TIMEOUT)
        .multipart(form);
    let resp = endpoint
        .authorize(request)
        .send()
        .await
        .context("Couldn't reach the transcription endpoint")?;
    let status = resp.status();
    let text = resp.text().await?;
    if status.is_success() {
        return serde_json::from_str(&text)
            .map(Some)
            .context("The transcription endpoint didn't reply in the OpenAI format");
    }
    if verbose && status == reqwest::StatusCode::BAD_REQUEST {
        return Ok(None);
    }
    bail!(
        "Transcription endpoint error ({status}): {}",
        error_message(&text)
    );
}

#[derive(Debug, Deserialize)]
struct Reply {
    #[serde(default)]
    text: String,
    #[serde(default)]
    segments: Vec<ReplySegment>,
}

#[derive(Debug, Deserialize)]
struct ReplySegment {
    start: f64,
    end: f64,
    text: String,
    avg_logprob: Option<f64>,
}

impl Reply {
    /// The reply's sentences, timed from the start of the recording. Without
    /// timestamps, each sentence gets a share of the piece's time in
    /// proportion to its length.
    fn into_segments(self, offset_ms: u64, duration_ms: u64) -> Vec<TranscriptionSegment> {
        let ms = |secs: f64| offset_ms + (secs.max(0.0) * 1000.0) as u64;
        if !self.segments.is_empty() {
            return self
                .segments
                .into_iter()
                .filter(|s| !s.text.trim().is_empty())
                .map(|s| TranscriptionSegment {
                    text: s.text.trim().to_string(),
                    start_ms: ms(s.start),
                    end_ms: ms(s.end.max(s.start)),
                    confidence: s
                        .avg_logprob
                        .map_or(1.0, |p| p.exp().clamp(0.0, 1.0) as f32),
                })
                .collect();
        }
        let sentences = split_sentences(&self.text);
        let total = sentences
            .iter()
            .map(|s| s.chars().count())
            .sum::<usize>()
            .max(1) as u64;
        let mut at = 0;
        sentences
            .into_iter()
            .map(|text| {
                let len = text.chars().count();
                let start = offset_ms + duration_ms * at as u64 / total;
                at += len;
                let end = offset_ms + duration_ms * at as u64 / total;
                TranscriptionSegment {
                    text,
                    start_ms: start,
                    end_ms: end,
                    confidence: 1.0,
                }
            })
            .collect()
    }
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        current.push(c);
        let ends = matches!(c, '.' | '?' | '!') && chars.peek().is_none_or(|n| n.is_whitespace());
        if ends {
            sentences.push(current.trim().to_string());
            current.clear();
        }
    }
    sentences.push(current.trim().to_string());
    sentences.retain(|s| !s.is_empty());
    sentences
}

/// A piece of the recording, encoded as WAV for upload.
struct Piece {
    /// The sample it starts at.
    start: usize,
    /// How many samples it holds.
    len: usize,
    wav: Vec<u8>,
}

/// The recording as mono pieces small enough to upload, and its sample rate.
fn read_pieces(audio_path: &Path) -> Result<(Vec<Piece>, u32)> {
    if let Err(e) = crate::audio::writer::repair_wav_header(audio_path) {
        tracing::warn!("Couldn't repair {}: {e:#}", audio_path.display());
    }
    let mut reader = hound::WavReader::open(audio_path)
        .with_context(|| format!("Couldn't read {}", audio_path.display()))?;
    let spec = reader.spec();
    if spec.bits_per_sample != 16 || spec.sample_format != hound::SampleFormat::Int {
        bail!("The recording isn't 16-bit PCM");
    }
    let channels = spec.channels.max(1) as usize;
    let mut mono = Vec::with_capacity(reader.duration() as usize);
    let mut samples = reader.samples::<i16>().map_while(Result::ok);
    loop {
        let (sum, n) = samples
            .by_ref()
            .take(channels)
            .fold((0i32, 0i32), |(sum, n), s| (sum + s as i32, n + 1));
        if n == 0 {
            break;
        }
        mono.push((sum / n) as i16);
    }
    let pieces = split(&mono, spec.sample_rate as usize, MAX_UPLOAD_BYTES / 2)
        .into_iter()
        .map(|(start, end)| {
            Ok(Piece {
                start,
                len: end - start,
                wav: encode_wav(&mono[start..end], spec.sample_rate)?,
            })
        })
        .collect::<Result<_>>()?;
    Ok((pieces, spec.sample_rate))
}

/// Where to cut `samples` into pieces of at most `max_samples`, as
/// `(start, end)` ranges.
fn split(samples: &[i16], rate: usize, max_samples: usize) -> Vec<(usize, usize)> {
    let frame = (rate * SPLIT_FRAME_MS / 1000).max(1);
    let search = (rate * SPLIT_SEARCH_SECS).min(max_samples / 2);
    let mut pieces = Vec::new();
    let mut start = 0;
    while start < samples.len() {
        let mut end = (start + max_samples).min(samples.len());
        if end < samples.len() {
            end = quietest_frame(samples, end - search, end, frame);
        }
        pieces.push((start, end));
        start = end;
    }
    pieces
}

/// The start of the quietest `frame` between `from` and `to`.
fn quietest_frame(samples: &[i16], from: usize, to: usize, frame: usize) -> usize {
    (from..to.saturating_sub(frame))
        .step_by(frame)
        .min_by_key(|&at| {
            samples[at..at + frame]
                .iter()
                .map(|&s| (s as i64).pow(2))
                .sum::<i64>()
        })
        .map_or(to, |at| at + frame / 2)
}

fn encode_wav(samples: &[i16], rate: u32) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut out = Cursor::new(Vec::with_capacity(samples.len() * 2 + 44));
    let mut writer = hound::WavWriter::new(&mut out, spec)?;
    for &s in samples {
        writer.write_sample(s)?;
    }
    writer.finalize()?;
    Ok(out.into_inner())
}

/// Replaces a meeting's transcript with `segments`. Each new line keeps the
/// speaker of the old line it overlaps most, so the user stays told apart
/// from the call, and names already given carry over.
pub fn replace_transcript(
    db: &Database,
    meeting_id: &str,
    segments: Vec<TranscriptionSegment>,
) -> Result<Vec<TranscriptSegment>> {
    let old = db.get_transcript(meeting_id)?;
    let sentences: Vec<Sentence> = segments
        .into_iter()
        .map(|segment| Sentence {
            speaker: speaker_at(&old, segment.start_ms as i64, segment.end_ms as i64),
            segment,
        })
        .collect();
    db.delete_transcript(meeting_id)?;
    Ok(crate::pipeline::store(db, meeting_id, &sentences))
}

fn speaker_at(old: &[TranscriptSegment], start: i64, end: i64) -> String {
    let overlap = |s: &TranscriptSegment| s.end_ms.min(end) - s.start_ms.max(start);
    let distance = |s: &TranscriptSegment| (s.start_ms - start).abs();
    old.iter()
        .filter(|s| overlap(s) > 0)
        .max_by_key(|s| overlap(s))
        .or_else(|| old.iter().min_by_key(|s| distance(s)))
        .map_or_else(|| UNKNOWN_LABEL.to_string(), |s| s.speaker_label.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(json: &str) -> Reply {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn timed_segments_are_offset_into_the_recording() {
        let segments = reply(
            r#"{"text":"Hi. Bye.","segments":[
                {"start":0.5,"end":1.2,"text":" Hi.","avg_logprob":-0.1},
                {"start":2.0,"end":2.5,"text":"   "},
                {"start":3.0,"end":3.4,"text":"Bye."}]}"#,
        )
        .into_segments(60_000, 10_000);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "Hi.");
        assert_eq!((segments[0].start_ms, segments[0].end_ms), (60_500, 61_200));
        assert!((segments[0].confidence - 0.905).abs() < 0.01);
        assert_eq!(segments[1].confidence, 1.0);
    }

    #[test]
    fn untimed_text_is_spread_over_the_piece_by_sentence() {
        let segments =
            reply(r#"{"text":"One two. Three four?  Five"}"#).into_segments(1_000, 2_600);
        let texts: Vec<_> = segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, ["One two.", "Three four?", "Five"]);
        assert_eq!(segments[0].start_ms, 1_000);
        assert_eq!(segments.last().unwrap().end_ms, 3_600);
        assert!(segments.windows(2).all(|w| w[0].end_ms == w[1].start_ms));
    }

    #[test]
    fn decimals_dont_end_sentences() {
        assert_eq!(
            split_sentences("It costs 3.50 now. Ok"),
            ["It costs 3.50 now.", "Ok"]
        );
    }

    #[test]
    fn long_audio_splits_at_a_quiet_moment_under_the_limit() {
        let rate = 100;
        let mut samples = vec![1000i16; 1000];
        samples[850..860].fill(0);
        let pieces = split(&samples, rate, 900);
        assert_eq!(pieces.len(), 2);
        let first = pieces[0].1;
        assert!((850..=860).contains(&first), "split at {first}");
        assert_eq!(pieces[0].0, 0);
        assert_eq!(pieces[1], (first, samples.len()));
    }

    #[test]
    fn short_audio_is_one_piece() {
        let pieces = split(&[0; 50], 100, 900);
        assert_eq!(pieces, vec![(0, 50)]);
    }

    #[test]
    fn wav_round_trips() {
        let wav = encode_wav(&[0, 100, -100], 16_000).unwrap();
        let mut reader = hound::WavReader::new(Cursor::new(wav)).unwrap();
        let samples: Vec<i16> = reader.samples().map(Result::unwrap).collect();
        assert_eq!(samples, [0, 100, -100]);
    }

    #[test]
    fn replaced_lines_keep_the_overlapping_speaker() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Call".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        crate::pipeline::store(
            &db,
            &meeting.id,
            &[
                Sentence {
                    segment: TranscriptionSegment {
                        text: "hi there".into(),
                        start_ms: 0,
                        end_ms: 2_000,
                        confidence: 0.4,
                    },
                    speaker: "You".into(),
                },
                Sentence {
                    segment: TranscriptionSegment {
                        text: "hello".into(),
                        start_ms: 2_000,
                        end_ms: 4_000,
                        confidence: 0.4,
                    },
                    speaker: "Ana".into(),
                },
            ],
        );
        let segment = |text: &str, start_ms, end_ms| TranscriptionSegment {
            text: text.into(),
            start_ms,
            end_ms,
            confidence: 1.0,
        };
        let stored = replace_transcript(
            &db,
            &meeting.id,
            vec![
                segment("Hi there.", 100, 1_900),
                segment("Hello!", 1_800, 3_900),
                segment("Bye.", 9_000, 9_500),
            ],
        )
        .unwrap();
        let labels: Vec<_> = stored.iter().map(|s| s.speaker_label.as_str()).collect();
        assert_eq!(labels, ["You", "Ana", "Ana"]);
        assert_eq!(db.get_transcript(&meeting.id).unwrap().len(), 3);
    }

    fn endpoint(base_url: String) -> Endpoint {
        Endpoint {
            base_url,
            models: vec!["whisper-large-v3".into()],
            api_key: Some("key".into()),
        }
    }

    fn write_wav(dir: &Path, seconds: usize) -> std::path::PathBuf {
        let path = dir.join("rec.wav");
        let rate = crate::audio::SAMPLE_RATE as usize;
        std::fs::write(
            &path,
            encode_wav(&vec![0; rate * seconds], rate as u32).unwrap(),
        )
        .unwrap();
        path
    }

    #[tokio::test]
    async fn uploads_the_recording_and_reads_timed_segments() {
        let (url, server) = crate::test_http::serve(vec![(
            200,
            r#"{"text":"Hello.","segments":[{"start":0.2,"end":1.0,"text":"Hello."}]}"#,
        )])
        .await;
        let dir = tempfile::tempdir().unwrap();
        let segments = transcribe(&endpoint(url), &write_wav(dir.path(), 2))
            .await
            .unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!((segments[0].start_ms, segments[0].end_ms), (200, 1_000));
        let request = &server.await.unwrap()[0];
        assert!(request.starts_with("POST /audio/transcriptions "));
        assert!(request.contains("whisper-large-v3"));
        assert!(request.contains("verbose_json"));
    }

    #[tokio::test]
    async fn asks_for_plain_json_when_verbose_is_refused() {
        let (url, server) = crate::test_http::serve(vec![
            (
                400,
                r#"{"error":{"message":"response_format verbose_json is not supported"}}"#,
            ),
            (200, r#"{"text":"Hello there."}"#),
        ])
        .await;
        let dir = tempfile::tempdir().unwrap();
        let segments = transcribe(&endpoint(url), &write_wav(dir.path(), 2))
            .await
            .unwrap();
        assert_eq!(segments[0].text, "Hello there.");
        assert_eq!((segments[0].start_ms, segments[0].end_ms), (0, 2_000));
        let requests = server.await.unwrap();
        assert!(!requests[1].contains("verbose_json"));
    }

    #[tokio::test]
    async fn other_errors_are_reported() {
        let (url, _server) =
            crate::test_http::serve(vec![(401, r#"{"error":{"message":"Bad key"}}"#)]).await;
        let dir = tempfile::tempdir().unwrap();
        let err = transcribe(&endpoint(url), &write_wav(dir.path(), 1))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Bad key"), "{err}");
    }
}
