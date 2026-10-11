//! End-to-end checks against the real ML models. They need the models
//! downloaded (Nootle's data dir, or XDG_DATA_HOME on Linux pointing at a
//! folder with Nootle/models), so they are ignored by default:
//!
//!     cargo test --test models_test -- --ignored

use nootle_app_lib::embedding::EmbeddingEngine;

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[test]
#[ignore = "needs the search model downloaded"]
fn embeddings_rank_paraphrases_above_unrelated_text() {
    let mut engine = EmbeddingEngine::load().expect("search model");
    let question = engine.embed("When is the Q3 budget due?").unwrap();
    let answer = engine
        .embed("Priya said the third-quarter budget has to be final by October 15.")
        .unwrap();
    let unrelated = engine
        .embed("We spent the rest of the call talking about the offsite in Lisbon.")
        .unwrap();
    let (relevant, noise) = (cosine(&question, &answer), cosine(&question, &unrelated));
    assert!(
        relevant > noise + 0.1,
        "relevant {relevant:.3} should clearly beat unrelated {noise:.3}"
    );
}

mod golden {
    use nootle_app_lib::import::ImportSource;
    use std::path::{Path, PathBuf};

    pub struct Turn {
        pub speaker: String,
        pub channel: String,
        pub start_ms: u64,
        pub end_ms: u64,
        pub text: String,
    }

    pub struct Call {
        pub mic: Vec<f32>,
        pub system: Vec<f32>,
        pub turns: Vec<Turn>,
    }

    impl Call {
        pub fn mixed(&self) -> Vec<f32> {
            self.mic
                .iter()
                .zip(&self.system)
                .map(|(a, b)| a + b)
                .collect()
        }

        pub fn reference_text(&self) -> String {
            self.turns
                .iter()
                .map(|t| t.text.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        }
    }

    fn fixtures() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
    }

    fn decode(name: &str) -> Vec<f32> {
        let mut out = Vec::new();
        ImportSource::open(&fixtures().join(name))
            .unwrap()
            .decode(|s| {
                out.extend_from_slice(s);
                Ok(())
            })
            .unwrap();
        out
    }

    pub fn call() -> Call {
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(fixtures().join("call.json")).unwrap())
                .unwrap();
        let turns = json["turns"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| Turn {
                speaker: t["speaker"].as_str().unwrap().to_string(),
                channel: t["channel"].as_str().unwrap().to_string(),
                start_ms: t["start_ms"].as_u64().unwrap(),
                end_ms: t["end_ms"].as_u64().unwrap(),
                text: t["text"].as_str().unwrap().to_string(),
            })
            .collect();
        let (mic, system) = (decode("call_mic.flac"), decode("call_system.flac"));
        assert_eq!(mic.len(), system.len());
        Call { mic, system, turns }
    }

    fn words(text: &str) -> Vec<String> {
        text.to_uppercase()
            .split(|c: char| !c.is_alphanumeric() && c != '\'')
            .filter(|w| !w.is_empty())
            .map(str::to_string)
            .collect()
    }

    /// Word error rate of `hypothesis` against `reference`, ignoring case
    /// and punctuation.
    pub fn wer(reference: &str, hypothesis: &str) -> f32 {
        let (r, h) = (words(reference), words(hypothesis));
        let mut prev: Vec<usize> = (0..=h.len()).collect();
        for i in 1..=r.len() {
            let mut cur = vec![i; h.len() + 1];
            for j in 1..=h.len() {
                let sub = prev[j - 1] + usize::from(r[i - 1] != h[j - 1]);
                cur[j] = sub.min(prev[j] + 1).min(cur[j - 1] + 1);
            }
            prev = cur;
        }
        prev[h.len()] as f32 / r.len().max(1) as f32
    }
}

fn chunks(call: &golden::Call) -> Vec<nootle_app_lib::audio::AudioChunk> {
    let mixed = call.mixed();
    (0..mixed.len())
        .step_by(32_000)
        .map(|i| {
            let end = (i + 32_000).min(mixed.len());
            nootle_app_lib::audio::AudioChunk {
                mixed: mixed[i..end].to_vec(),
                mic: call.mic[i..end].to_vec(),
                system: call.system[i..end].to_vec(),
            }
        })
        .collect()
}

/// The words survive: live transcription of the call, fed in 2 s chunks
/// like a recording, stays close to the reference text. Fixed 2 s windows
/// scored ~49% WER on this call.
#[test]
#[ignore = "needs the transcription model downloaded"]
fn live_transcription_keeps_whole_sentences() {
    let call = golden::call();
    let mut transcriber = nootle_app_lib::pipeline::live_transcriber(true).expect("models");
    let started = std::time::Instant::now();
    let mut sentences = Vec::new();
    for chunk in chunks(&call) {
        sentences.extend(transcriber.push(chunk));
    }
    sentences.extend(transcriber.finish());
    let hypothesis: Vec<&str> = sentences.iter().map(|s| s.segment.text.as_str()).collect();
    let wer = golden::wer(&call.reference_text(), &hypothesis.join(" "));
    eprintln!(
        "live: WER {:.1}% in {:?}, {} sentences",
        wer * 100.0,
        started.elapsed(),
        sentences.len()
    );
    for s in &sentences {
        eprintln!(
            "  [{:>6}-{:>6}] {:<10} {:.2} {}",
            s.segment.start_ms, s.segment.end_ms, s.speaker, s.segment.confidence, s.segment.text
        );
    }
    assert!(wer < 0.12, "WER {:.1}%", wer * 100.0);
    for s in &sentences {
        assert!(s.segment.end_ms > s.segment.start_ms);
        assert!((0.0..=1.0).contains(&s.segment.confidence));
    }
    // Every mic turn is the user's own.
    for turn in call.turns.iter().filter(|t| t.channel == "mic") {
        let during: Vec<_> = sentences
            .iter()
            .filter(|s| {
                s.segment.start_ms >= turn.start_ms && s.segment.end_ms <= turn.end_ms + 300
            })
            .collect();
        assert!(!during.is_empty(), "no sentence during {}", turn.text);
        assert!(during.iter().all(|s| s.speaker == "You"), "{:?}", during);
    }
}

/// Who said what: a recording transcribed from its stems file (as crash
/// recovery does) and then relabelled by the post-meeting speaker pass
/// tells the user and both remote voices apart.
#[test]
#[ignore = "needs the transcription and speaker models downloaded"]
fn recovered_recording_gets_the_speakers_right() {
    use nootle_app_lib::audio::AudioWriter;
    use nootle_app_lib::db::{Database, NewMeeting};

    let call = golden::call();
    let dir = tempfile::tempdir().unwrap();
    let audio_path = dir.path().join("meeting.wav");
    let mut mixed = AudioWriter::new(&audio_path, 16_000).unwrap();
    mixed.write_samples(&call.mixed()).unwrap();
    mixed.finalize().unwrap();
    let mut stems = AudioWriter::stereo(
        &nootle_app_lib::audio::writer::stems_path(&audio_path),
        16_000,
    )
    .unwrap();
    stems.write_stereo(&call.mic, &call.system).unwrap();
    stems.finalize().unwrap();

    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Golden call".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let started = std::time::Instant::now();
    let (duration_ms, count) =
        nootle_app_lib::pipeline::transcribe_file(&db, &meeting.id, &audio_path, |_| {}).unwrap();
    assert!(count > 0);
    assert!((duration_ms as i64 - 62_460).abs() < 100, "{duration_ms}");
    nootle_app_lib::pipeline::rediarize(&db, &meeting.id, &audio_path).unwrap();
    eprintln!("recovery + speaker pass in {:?}", started.elapsed());

    let segments = db.get_transcript(&meeting.id).unwrap();
    // Map each sentence to the reference turn it overlaps most.
    let truth = |start: i64, end: i64| -> &str {
        call.turns
            .iter()
            .max_by_key(|t| (end.min(t.end_ms as i64) - start.max(t.start_ms as i64)).max(0))
            .map(|t| t.speaker.as_str())
            .unwrap()
    };
    let mut mapping: std::collections::HashMap<String, std::collections::HashMap<String, usize>> =
        Default::default();
    for s in &segments {
        let t = truth(s.start_ms, s.end_ms).to_string();
        eprintln!("  {:<10} (truth {t:<3}) {}", s.speaker_label, s.text);
        *mapping
            .entry(s.speaker_label.clone())
            .or_default()
            .entry(t)
            .or_default() += 1;
    }
    // Each label should stand for one real speaker, and each real speaker
    // should have one label.
    let mut label_for = std::collections::HashMap::new();
    for (label, truths) in &mapping {
        let (best, _) = truths.iter().max_by_key(|(_, n)| **n).unwrap();
        assert!(
            label_for.insert(best.clone(), label.clone()).is_none(),
            "two labels for {best}: {mapping:?}"
        );
    }
    assert_eq!(label_for.get("You").map(String::as_str), Some("You"));
    assert!(
        label_for.contains_key("A") && label_for.contains_key("B"),
        "{mapping:?}"
    );
    let correct = segments
        .iter()
        .filter(|s| label_for.get(truth(s.start_ms, s.end_ms)) == Some(&s.speaker_label))
        .count();
    let accuracy = correct as f32 / segments.len() as f32;
    eprintln!("speaker accuracy {:.0}%", accuracy * 100.0);
    assert!(accuracy >= 0.9, "{mapping:?}");
}
