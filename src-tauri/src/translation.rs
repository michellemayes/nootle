//! Translates a meeting's transcript and summaries into another language with
//! the chosen AI, keeping each translated line tied to its transcript line so
//! timestamps, speakers, and playback still line up. Translations are kept per
//! language until the meeting is deleted or translated again.

use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use futures_util::StreamExt;

use crate::db::{Database, TranscriptSegment};
use crate::llm::{ChatMessage, LlmRegistry};

/// A meeting in another language.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MeetingTranslation {
    pub language: String,
    /// Each transcript line's translation, by segment id. Lines the model
    /// skipped are left out, so they show in the original.
    pub segments: HashMap<String, String>,
    /// Each summary's translation, by summary id.
    pub summaries: HashMap<String, String>,
    pub provider: String,
    pub model: String,
    pub created_at: String,
}

/// How much transcript goes into one request. Smaller than a summary's
/// budget: the reply is as long as the request, and a local model's context
/// window holds both.
fn chunk_chars(provider: &str) -> usize {
    if crate::llm::runs_locally(provider) {
        3_000
    } else {
        12_000
    }
}

/// Transcript lines as `N| text`, numbered by position, in chunks of at most
/// `max_chars` (a longer line gets a chunk of its own).
fn numbered_chunks(segments: &[TranscriptSegment], max_chars: usize) -> Vec<String> {
    let numbered: String = segments
        .iter()
        .enumerate()
        .map(|(i, seg)| format!("{i}| {}\n", seg.text.trim().replace('\n', " ")))
        .collect();
    crate::summarization::split_transcript(&numbered, max_chars)
}

/// The `N| text` lines of a reply, by number. Anything else (a preamble, a
/// code fence, a blank line) is ignored.
fn parse_numbered(reply: &str) -> HashMap<usize, String> {
    reply
        .lines()
        .filter_map(|line| {
            let (n, text) = line.trim().split_once('|')?;
            let text = text.trim();
            if text.is_empty() {
                return None;
            }
            Some((n.trim().parse().ok()?, text.to_string()))
        })
        .collect()
}

fn transcript_prompt(language: &str, glossary: &str) -> String {
    format!(
        "You translate meeting transcripts into {language}. Each input line is `N| text`. \
         Reply with exactly one line per input line, `N| translation`, keeping each number \
         and the order. Never merge, split, or skip lines, and add nothing else. Keep \
         people's names, product names, numbers, and code as they are. If a line is \
         already in {language}, repeat it unchanged.{glossary}"
    )
}

fn summary_prompt(language: &str, glossary: &str) -> String {
    format!(
        "Translate this meeting summary into {language}. Keep its Markdown formatting, \
         people's names, product names, numbers, and citations such as [slide 4] or \
         [12:34] exactly as they are. Reply with only the translation.{glossary}"
    )
}

async fn ask(
    llm: &LlmRegistry,
    provider: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String> {
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system.to_string(),
        },
        ChatMessage {
            role: "user".into(),
            content: user.to_string(),
        },
    ];
    crate::ops::chat(llm, provider, model, messages).await
}

/// Translates the transcript and the summaries into `language` and saves the
/// result, replacing any earlier translation into it.
pub async fn translate_meeting(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    language: &str,
    provider_name: &str,
    model: &str,
) -> Result<MeetingTranslation> {
    let language = language.trim();
    if language.is_empty() {
        anyhow::bail!("Pick a language to translate into");
    }
    let segments = db.get_transcript(meeting_id)?;
    let summaries = db.get_summaries_for_meeting(meeting_id)?;
    if segments.is_empty() && summaries.is_empty() {
        anyhow::bail!("This meeting has nothing to translate yet: no transcript or summary");
    }
    if provider_name.is_empty() || model.is_empty() {
        anyhow::bail!("Pick an AI model first (Settings → AI) to translate.");
    }
    if crate::llm::local_only_enabled(db) && !crate::llm::runs_locally(provider_name) {
        anyhow::bail!(
            "Local-only mode is on, so only a local model (Ollama) can translate. Pick one, or \
             turn Local-only mode off in Settings → Privacy."
        );
    }
    let glossary = crate::dictionary::glossary(db);

    // Transcript chunks and summaries share one queue, so a short meeting's
    // summaries don't wait for its transcript.
    let line_prompt = transcript_prompt(language, &glossary);
    let summary_prompt = summary_prompt(language, &glossary);
    let chunks = numbered_chunks(&segments, chunk_chars(provider_name));
    let jobs: Vec<_> = chunks
        .iter()
        .map(|chunk| ask(llm, provider_name, model, &line_prompt, chunk))
        .chain(
            summaries
                .iter()
                .map(|s| ask(llm, provider_name, model, &summary_prompt, &s.content)),
        )
        .collect();
    let mut replies: Vec<String> = futures_util::stream::iter(jobs)
        .buffered(crate::llm::concurrent_requests(provider_name))
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_>>()?;
    let translated = replies.split_off(chunks.len());
    let lines: HashMap<usize, String> = replies.iter().flat_map(|r| parse_numbered(r)).collect();

    let translation = MeetingTranslation {
        language: language.to_string(),
        segments: segments
            .iter()
            .enumerate()
            .filter_map(|(i, seg)| Some((seg.id.clone(), lines.get(&i)?.clone())))
            .collect(),
        summaries: summaries
            .iter()
            .zip(translated)
            .map(|(s, text)| (s.id.clone(), text.trim().to_string()))
            .collect(),
        provider: provider_name.to_string(),
        model: model.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.save_meeting_translation(meeting_id, &translation)?;
    Ok(translation)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(id: &str, text: &str) -> TranscriptSegment {
        TranscriptSegment {
            id: id.into(),
            meeting_id: "m".into(),
            speaker_label: "Ana".into(),
            text: text.into(),
            start_ms: 0,
            end_ms: 1_000,
            confidence: 1.0,
        }
    }

    #[test]
    fn chunks_number_every_line_once_within_the_budget() {
        let segments = [
            seg("a", "Hello there"),
            seg("b", "Two\nlines"),
            seg("c", "Bye"),
        ];
        let chunks = numbered_chunks(&segments, 26);
        assert_eq!(chunks, ["0| Hello there\n", "1| Two lines\n2| Bye\n"]);
        assert!(numbered_chunks(&[], 100).is_empty());
    }

    #[test]
    fn replies_are_read_line_by_number_ignoring_chatter() {
        let reply = "Here you go:\n```\n0| Hola\n 2 |Adiós \n1|\nx| nope\n```";
        let lines = parse_numbered(reply);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[&0], "Hola");
        assert_eq!(lines[&2], "Adiós");
    }

    /// "Translates" by upper-casing: transcript lines but the last one asked
    /// for (as if the model skipped it), and summaries whole.
    struct ShoutingLlm;

    #[async_trait::async_trait]
    impl crate::llm::LlmProvider for ShoutingLlm {
        fn provider_name(&self) -> &str {
            "fake"
        }
        fn available_models(&self) -> Vec<crate::llm::ModelInfo> {
            Vec::new()
        }
        async fn chat(&self, messages: Vec<ChatMessage>, _model: &str) -> Result<String> {
            let input = &messages[1].content;
            if !messages[0].content.contains("`N| text`") {
                return Ok(format!(" {} ", input.to_uppercase()));
            }
            let lines: Vec<_> = input.lines().collect();
            Ok(lines[..lines.len() - 1].join("\n").to_uppercase())
        }
    }

    #[tokio::test]
    async fn meetings_translate_line_by_line_and_skipped_lines_stay_original() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Sync".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        let mut llm = LlmRegistry::new();
        llm.register(Box::new(ShoutingLlm));
        let err = translate_meeting(&db, &llm, &meeting.id, "Spanish", "fake", "m").await;
        assert!(err
            .unwrap_err()
            .to_string()
            .contains("nothing to translate"));

        for (i, text) in ["hello", "ship it", "bye"].iter().enumerate() {
            db.create_transcript_segment(crate::db::NewTranscriptSegment {
                meeting_id: meeting.id.clone(),
                speaker_label: "Ana".into(),
                text: text.to_string(),
                start_ms: i as i64 * 1_000,
                end_ms: i as i64 * 1_000 + 900,
                confidence: 0.9,
            })
            .unwrap();
        }
        let summary = db
            .create_summary(crate::db::NewSummary {
                meeting_id: meeting.id.clone(),
                template_id: None,
                provider: "fake".into(),
                model: "m".into(),
                content: "## Decisions\n- ship".into(),
            })
            .unwrap();
        assert!(translate_meeting(&db, &llm, &meeting.id, " ", "fake", "m")
            .await
            .is_err());
        assert!(
            translate_meeting(&db, &llm, &meeting.id, "Spanish", "nope", "m")
                .await
                .is_err()
        );

        let t = translate_meeting(&db, &llm, &meeting.id, " Spanish ", "fake", "m")
            .await
            .unwrap();
        assert_eq!(t.language, "Spanish");
        let segments = db.get_transcript(&meeting.id).unwrap();
        assert_eq!(t.segments.len(), 2, "the skipped line is left out");
        assert_eq!(t.segments[&segments[0].id], "HELLO");
        assert_eq!(t.segments[&segments[1].id], "SHIP IT");
        assert_eq!(t.summaries[&summary.id], "## DECISIONS\n- SHIP");
        assert_eq!(db.list_meeting_translations(&meeting.id).unwrap(), vec![t]);
    }

    #[test]
    fn translations_are_kept_per_language_and_replaced() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Sync".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        assert!(db
            .list_meeting_translations(&meeting.id)
            .unwrap()
            .is_empty());
        let mut es = MeetingTranslation {
            language: "Spanish".into(),
            segments: HashMap::from([("s1".into(), "Hola".into())]),
            ..Default::default()
        };
        db.save_meeting_translation(&meeting.id, &es).unwrap();
        es.segments.insert("s2".into(), "Adiós".into());
        db.save_meeting_translation(&meeting.id, &es).unwrap();
        let fr = MeetingTranslation {
            language: "French".into(),
            ..Default::default()
        };
        db.save_meeting_translation(&meeting.id, &fr).unwrap();

        let all = db.list_meeting_translations(&meeting.id).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.iter().find(|t| t.language == "Spanish"), Some(&es));

        db.delete_meeting(&meeting.id).unwrap();
        assert!(db
            .list_meeting_translations(&meeting.id)
            .unwrap()
            .is_empty());
    }
}
