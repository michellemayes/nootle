//! Live Assist: while a meeting is recorded, notices questions in the
//! conversation and answers them from the knowledge base and past meetings,
//! as cards with their sources. Also answers questions typed during the
//! meeting.

use crate::db::{AskFilters, Database};
use crate::llm::{ChatMessage, LlmRegistry};
use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::{json, Value};

/// Turns on Live Assist cards while recording. Off unless turned on.
pub const SETTING_KEY: &str = "live_assist";

/// Questions shorter than this are usually conversational ("Right?").
const MIN_QUESTION_WORDS: usize = 4;

/// Check-ins and pleasantries that end in a question mark but aren't asking
/// for information.
const SMALL_TALK: &[&str] = &[
    "can you hear me",
    "can everyone hear me",
    "can you see my screen",
    "can everyone see my screen",
    "can you see it",
    "does that make sense",
    "how are you doing",
    "how is everyone doing",
    "how's everyone doing",
    "how was your weekend",
    "is that okay",
    "is that ok",
    "you know what i mean",
    "are we good",
    "any questions",
    "does anyone have any questions",
    "shall we get started",
    "should we get started",
];

/// The question asked in a transcript segment, if it asks one worth
/// answering: the last sentence ending in "?" that isn't small talk.
pub fn extract_question(text: &str) -> Option<String> {
    let mut sentences = Vec::new();
    let mut start = 0;
    for (i, c) in text.char_indices() {
        if matches!(c, '.' | '!' | '?') {
            sentences.push(text[start..i + c.len_utf8()].trim());
            start = i + c.len_utf8();
        }
    }
    sentences.into_iter().rev().find_map(|sentence| {
        let question = sentence.strip_suffix('?')?.trim();
        let normalized: String = question
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '\'')
            .collect();
        let normalized = normalized.split_whitespace().collect::<Vec<_>>().join(" ");
        let words = normalized.split(' ').count();
        (words >= MIN_QUESTION_WORDS && !SMALL_TALK.iter().any(|s| normalized.ends_with(s)))
            .then(|| format!("{question}?"))
    })
}

/// A Live Assist answer, with the passages it drew on (in the same shape
/// as Ask's sources).
#[derive(Debug, Clone, Serialize)]
pub struct LiveAssistCard {
    pub id: String,
    pub question: String,
    /// None when no AI model is available: the sources alone are shown.
    pub answer: Option<String>,
    pub sources: Vec<Value>,
    /// Whether it answered a question heard in the meeting, not a typed one.
    pub automatic: bool,
}

/// Passages at least this close to the question (L2 distance between unit
/// vectors, about 0.5 cosine similarity) are worth an unprompted card.
const MAX_AUTOMATIC_DISTANCE: f64 = 1.0;
/// The model says this when the passages don't answer the question.
const NO_ANSWER: &str = "NO_ANSWER";
/// Minutes of the live conversation given to the model as context.
const RECENT_MINUTES: i64 = 3;

/// Answers `question` for a meeting being recorded. An automatic card is
/// only made when something relevant is found, so Live Assist stays quiet
/// rather than guessing. Without `llm`, the card lists sources only.
pub async fn answer(
    db: &Database,
    llm: Option<(&LlmRegistry, &str, &str)>,
    meeting_id: &str,
    question: &str,
    query_embedding: &[f32],
    automatic: bool,
) -> Result<Option<LiveAssistCard>> {
    let has_knowledge = db.has_knowledge()?;
    let no_filters = AskFilters::default();
    if automatic {
        let best_document = if has_knowledge {
            db.search_knowledge_similar(query_embedding, 1, &[], &[])?
                .first()
                .map(|h| h.distance)
        } else {
            None
        };
        let best_meeting = db
            .search_similar_chunks(query_embedding, 3, &no_filters)?
            .into_iter()
            .find(|c| c.meeting_id != meeting_id)
            .map(|c| c.distance);
        let best = best_document
            .into_iter()
            .chain(best_meeting)
            .fold(f64::MAX, f64::min);
        if best > MAX_AUTOMATIC_DISTANCE {
            return Ok(None);
        }
    }

    let documents = if has_knowledge {
        crate::knowledge::search(db, query_embedding, question, &[], &[], 4)?
    } else {
        Vec::new()
    };
    let meetings: Vec<_> =
        crate::ops::hybrid_search(db, query_embedding, question, &no_filters, 5)?
            .into_iter()
            .filter(|c| c.meeting_id != meeting_id)
            .take(3)
            .collect();
    if automatic && documents.is_empty() && meetings.is_empty() {
        return Ok(None);
    }

    let mut sources: Vec<Value> = documents
        .iter()
        .map(crate::knowledge::source_json)
        .collect();
    sources.extend(meetings.iter().map(|m| {
        json!({
            "meeting_id": m.meeting_id,
            "meeting_title": m.meeting_title,
            "start_ms": m.start_ms,
            "end_ms": m.end_ms,
        })
    }));
    let card = |answer: Option<String>, sources: Vec<Value>| LiveAssistCard {
        id: uuid::Uuid::new_v4().to_string(),
        question: question.to_string(),
        answer,
        sources,
        automatic,
    };

    let Some((llm, provider, model)) = llm else {
        return Ok(Some(card(None, sources)));
    };
    if documents.is_empty() && meetings.is_empty() {
        return Ok(Some(card(
            Some("Nothing in your documents or past meetings covers this yet.".into()),
            sources,
        )));
    }

    let mut excerpts = vec![crate::knowledge::prompt_context(&documents)];
    excerpts.extend(meetings.iter().map(|m| {
        format!(
            "---\n[Meeting: \"{}\", {}]\n{}\n",
            m.meeting_title,
            crate::summarization::format_ms(m.start_ms),
            m.chunk_text
        )
    }));
    let recent = crate::ops::recent_transcript(&db.get_transcript(meeting_id)?, RECENT_MINUTES);
    let system = format!(
        "You are Live Assist in Nootle, helping the user (\"You\" in the transcript) during a \
         live meeting. Answer the question using ONLY the excerpts from the user's documents \
         and past meetings below. Reply in one to three short sentences the user could say \
         aloud, with the specifics (numbers, names, dates). Cite each fact as [Document title, \
         page] or [Meeting Title, timestamp]. If the excerpts don't answer the question, reply \
         with exactly {NO_ANSWER}.\n\n\
         EXCERPTS:\n{}\n\n\
         THE LAST FEW MINUTES OF THE MEETING:\n{}{}{}",
        excerpts.join("\n"),
        crate::summarization::format_transcript(&recent),
        crate::calendar::context_section(db, meeting_id),
        crate::dictionary::glossary(db),
    );
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system,
        },
        ChatMessage {
            role: "user".into(),
            content: question.to_string(),
        },
    ];
    let reply = llm
        .get_provider(provider)
        .ok_or_else(|| anyhow!("Provider '{provider}' not found"))?
        .chat(messages, model)
        .await?;
    let reply = reply.trim();
    if reply.is_empty() || reply.contains(NO_ANSWER) {
        if automatic {
            return Ok(None);
        }
        return Ok(Some(card(
            Some("Nothing in your documents or past meetings answers this.".into()),
            sources,
        )));
    }
    Ok(Some(card(Some(reply.to_string()), sources)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_real_questions() {
        assert_eq!(
            extract_question("Okay. What was the churn rate in the Q3 report?"),
            Some("What was the churn rate in the Q3 report?".into())
        );
        assert_eq!(
            extract_question("When does the enterprise contract renew? I forget."),
            Some("When does the enterprise contract renew?".into())
        );
    }

    #[test]
    fn ignores_statements_short_questions_and_small_talk() {
        assert_eq!(extract_question("We shipped the beta last week."), None);
        assert_eq!(extract_question("Right?"), None);
        assert_eq!(extract_question("Sounds good, okay?"), None);
        assert_eq!(extract_question("Hi all, can everyone hear me?"), None);
        assert_eq!(extract_question("So, does that make sense?"), None);
        assert_eq!(
            extract_question("Let me share. Can you see my screen?"),
            None
        );
    }

    #[test]
    fn stays_quiet_without_anything_relevant() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Live".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut embedding = vec![0f32; 384];
        embedding[0] = 1.0;
        let card = rt
            .block_on(answer(
                &db,
                None,
                &meeting.id,
                "What is the renewal date for Acme?",
                &embedding,
                true,
            ))
            .unwrap();
        assert!(card.is_none());

        // A typed question always gets a card, even with nothing to cite.
        let card = rt
            .block_on(answer(
                &db,
                None,
                &meeting.id,
                "What is the renewal date for Acme?",
                &embedding,
                false,
            ))
            .unwrap()
            .unwrap();
        assert!(card.sources.is_empty());
        assert!(!card.automatic);
    }
}
