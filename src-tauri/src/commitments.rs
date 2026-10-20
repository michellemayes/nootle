//! Commitment tracking: whether the action items people own get done.
//!
//! A commitment is an action item with an owner. When a meeting finishes,
//! the open commitments from earlier meetings whose owner was there, or
//! whose topic comes up, are checked against passages from the new
//! transcript: the model marks each done or slipped, with the moment and
//! words that show it, or leaves it open. Only those commitments and their
//! passages go into the prompt, so it stays small however long the history.
//!
//! An open commitment also counts as slipped once its due date has passed.
//! Done and dropped are the action item's own status, so ticking an item
//! off anywhere in the app closes the commitment too.

use std::collections::HashSet;

use anyhow::{bail, Result};
use serde_json::{json, Value};

use crate::db::{Commitment, Database};
use crate::llm::{ChatMessage, LlmRegistry};

/// Checks open commitments against each new meeting with the automatic
/// model. Off unless turned on.
pub const SETTING_KEY: &str = "commitment_checks";
pub const STATUSES: &[&str] = &["open", "done", "slipped", "dropped"];

/// At most this many commitments go into one check, newest first.
const MAX_CHECKED: usize = 8;
/// Passages of the new meeting given per commitment.
const PASSAGES_PER_COMMITMENT: usize = 2;
/// A passage this close in meaning (L2 distance between unit vectors, about
/// 0.5 cosine similarity) means a commitment's topic came up.
const TOPIC_DISTANCE: f64 = 1.0;
/// Or this many of its words.
const TOPIC_WORDS: usize = 2;
/// Live Assist reminds of at most this many commitments at once.
const MAX_REMINDERS: usize = 2;

/// A commitment's status for follow-through, from its action item's.
pub fn follow_through_status(
    status: &str,
    slipped: bool,
    due_date: Option<&str>,
    today: &str,
) -> &'static str {
    match status {
        "done" => "done",
        "cancelled" => "dropped",
        _ if slipped || due_date.is_some_and(|d| !d.is_empty() && d < today) => "slipped",
        _ => "open",
    }
}

/// Today's date, as due dates are written.
pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Whether two names are the same person, as the call window's names are
/// matched ("Priya" is "Priya Shah"); "me" and "I" are the user, "You".
pub fn same_person(a: &str, b: &str) -> bool {
    let user = |name: &str| match name.trim().to_lowercase().as_str() {
        "me" | "i" | "myself" => crate::diarization::SELF_LABEL.to_string(),
        _ => name.to_string(),
    };
    crate::call_names::same_person(&user(a), &user(b))
}

/// Commitments, filtered by owner and status.
pub fn list(db: &Database, owner: Option<&str>, status: Option<&str>) -> Result<Vec<Commitment>> {
    if let Some(status) = status {
        crate::ops::validate_one_of("commitment status", status, STATUSES)?;
    }
    Ok(db
        .list_commitments(&today())?
        .into_iter()
        .filter(|c| owner.is_none_or(|o| same_person(&c.owner, o)))
        .filter(|c| status.is_none_or(|s| c.status == s))
        .collect())
}

/// Whether a commitment is still to be done.
pub fn is_pending(c: &Commitment) -> bool {
    c.status == "open" || c.status == "slipped"
}

const STOP_WORDS: &[&str] = &[
    "about", "after", "again", "also", "been", "before", "could", "does", "done", "each", "from",
    "going", "have", "into", "just", "know", "like", "make", "more", "next", "over", "should",
    "some", "that", "their", "them", "then", "there", "they", "this", "through", "want", "week",
    "were", "what", "when", "which", "will", "with", "would", "your",
];

/// The words that carry a sentence's topic, roughly singular.
fn topic_words(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 4 && !STOP_WORDS.contains(w))
        .map(|w| {
            w.strip_suffix('s')
                .filter(|s| s.len() >= 4)
                .unwrap_or(w)
                .to_string()
        })
        .collect()
}

/// How many topic words two texts share.
fn shared_words(a: &HashSet<String>, text: &str) -> usize {
    topic_words(text).intersection(a).count()
}

/// A stretch of the new meeting's transcript.
#[derive(Debug, Clone)]
pub struct Passage {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

/// What one check asks the model: the commitments worth checking against a
/// meeting, each with the indexes of its passages.
#[derive(Debug)]
pub struct Check {
    pub meeting_id: String,
    pub commitments: Vec<(Commitment, Vec<usize>)>,
    pub passages: Vec<Passage>,
}

/// Who was in a meeting: its named speakers, "You", and who was invited.
fn attendees(
    db: &Database,
    meeting_id: &str,
    transcript: &[crate::db::TranscriptSegment],
) -> Result<Vec<String>> {
    let mut names: Vec<String> = transcript
        .iter()
        .map(|s| s.speaker_label.clone())
        .filter(|l| {
            l.as_str() == crate::diarization::SELF_LABEL
                || !crate::diarization::is_automatic_label(l)
        })
        .collect();
    if let Some(context) = db.get_meeting_calendar_context(meeting_id)? {
        names.extend(context.attendees);
    }
    names.sort();
    names.dedup();
    Ok(names)
}

/// Picks the open commitments from earlier meetings worth checking against
/// `meeting_id` and the passages of it that bear on each: the best ones
/// by keywords and, when `embed` gives a vector and the meeting is indexed,
/// by meaning. Kept when the owner was there or the topic came up. `None`
/// when there's nothing to check.
pub fn gather(
    db: &Database,
    meeting_id: &str,
    mut embed: impl FnMut(&str) -> Option<Vec<f32>>,
) -> Result<Option<Check>> {
    let meeting = db.get_meeting(meeting_id)?;
    let pending: Vec<Commitment> = db
        .pending_commitments(&today())?
        .into_iter()
        .filter(|c| c.meeting_start_time < meeting.start_time)
        .collect();
    if pending.is_empty() {
        return Ok(None);
    }
    let transcript = db.get_transcript(meeting_id)?;
    // The search index's passages when the meeting has one, so they can be
    // found by meaning too; else the same passages, cut here.
    let mut indexed = true;
    let mut passages = db.meeting_chunks(meeting_id)?;
    if passages.is_empty() {
        indexed = false;
        passages = crate::chunking::chunk_segments(&transcript)
            .into_iter()
            .map(|(text, start_ms, end_ms, _)| (text, start_ms, end_ms))
            .collect();
    }
    let passages: Vec<Passage> = passages
        .into_iter()
        .map(|(text, start_ms, end_ms)| Passage {
            start_ms,
            end_ms,
            text,
        })
        .collect();
    if passages.is_empty() {
        return Ok(None);
    }
    let attendees = attendees(db, meeting_id, &transcript)?;

    let mut picked = Vec::new();
    for commitment in pending {
        let words = topic_words(&commitment.content);
        let mut by_keywords: Vec<(usize, usize)> = passages
            .iter()
            .enumerate()
            .map(|(i, p)| (i, shared_words(&words, &p.text)))
            .filter(|(_, n)| *n > 0)
            .collect();
        by_keywords.sort_by_key(|&(_, n)| std::cmp::Reverse(n));
        let by_meaning: Vec<(usize, f64)> =
            match indexed.then(|| embed(&commitment.content)).flatten() {
                Some(vector) => db
                    .meeting_chunks_similar(meeting_id, &vector, PASSAGES_PER_COMMITMENT * 2)?
                    .into_iter()
                    .filter_map(|(i, d)| usize::try_from(i).ok().map(|i| (i, d)))
                    .filter(|(i, _)| *i < passages.len())
                    .collect(),
                None => Vec::new(),
            };
        let topical = by_keywords.first().is_some_and(|(_, n)| *n >= TOPIC_WORDS)
            || by_meaning
                .first()
                .is_some_and(|(_, d)| *d <= TOPIC_DISTANCE);
        let attended = attendees.iter().any(|a| same_person(a, &commitment.owner));
        if !topical && !attended {
            continue;
        }
        let key = |i: usize| i.to_string();
        let ranked = crate::ops::reciprocal_rank_fusion(
            [
                by_keywords.iter().map(|(i, _)| key(*i)).collect::<Vec<_>>(),
                by_meaning.iter().map(|(i, _)| key(*i)).collect(),
            ],
            PASSAGES_PER_COMMITMENT,
            |k| k.as_str(),
        );
        let mut indexes: Vec<usize> = ranked.iter().filter_map(|k| k.parse().ok()).collect();
        if indexes.is_empty() {
            continue;
        }
        indexes.sort_unstable();
        picked.push((topical, commitment, indexes));
    }
    // Commitments whose topic came up first, then the newest.
    picked.sort_by_key(|(topical, _, _)| !*topical);
    picked.truncate(MAX_CHECKED);
    if picked.is_empty() {
        return Ok(None);
    }

    // Only the passages some commitment uses go into the prompt.
    let mut used: Vec<usize> = picked.iter().flat_map(|(_, _, ix)| ix.clone()).collect();
    used.sort_unstable();
    used.dedup();
    let position = |i: usize| used.binary_search(&i).unwrap_or(0);
    let commitments = picked
        .into_iter()
        .map(|(_, c, ix)| (c, ix.into_iter().map(position).collect()))
        .collect();
    Ok(Some(Check {
        meeting_id: meeting_id.to_string(),
        commitments,
        passages: used.into_iter().map(|i| passages[i].clone()).collect(),
    }))
}

/// The model's answer for one commitment.
#[derive(Debug, Clone, PartialEq)]
pub struct Verdict {
    /// Index into the check's commitments.
    pub index: usize,
    /// done or slipped; commitments left open get no verdict.
    pub status: String,
    pub timestamp_ms: Option<i64>,
    pub quote: Option<String>,
}

const MAX_QUOTE_CHARS: usize = 300;

fn prompt(check: &Check) -> Vec<ChatMessage> {
    let commitments: Vec<String> = check
        .commitments
        .iter()
        .enumerate()
        .map(|(i, (c, passages))| {
            let due = c
                .due_date
                .as_deref()
                .map(|d| format!(", due {d}"))
                .unwrap_or_default();
            let refs: Vec<String> = passages.iter().map(|p| format!("E{}", p + 1)).collect();
            format!(
                "C{}: {} committed to: {} (in \"{}\"{due}). Relevant excerpts: {}",
                i + 1,
                c.owner,
                c.content,
                c.meeting_title,
                refs.join(", ")
            )
        })
        .collect();
    let excerpts: Vec<String> = check
        .passages
        .iter()
        .enumerate()
        .map(|(i, p)| {
            format!(
                "[E{} · {} · starts at {} ms]\n{}",
                i + 1,
                crate::summarization::format_ms(p.start_ms),
                p.start_ms,
                p.text
            )
        })
        .collect();
    let system = "You check whether commitments people made in earlier meetings were followed \
         through, using excerpts from a new meeting. For each commitment decide:\n\
         - done: an excerpt says it was done, sent, shipped or delivered.\n\
         - slipped: an excerpt says it isn't done yet, was delayed or pushed back, or is blocked.\n\
         - open: it isn't mentioned, or it's unclear.\n\
         Only say done or slipped when an excerpt clearly shows it; when in doubt, say open. \
         Return ONLY a JSON object, no markdown:\n\
         {\"results\": [{\"id\": \"C1\", \"status\": \"done\", \"timestamp_ms\": 12345, \
         \"quote\": \"the words that show it\"}]}\n\
         timestamp_ms is about when the words that show it were said. quote is at most 25 \
         words copied from the excerpt. Leave out commitments that stay open.";
    vec![
        ChatMessage {
            role: "system".into(),
            content: system.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!(
                "COMMITMENTS:\n{}\n\nEXCERPTS FROM THE NEW MEETING:\n{}",
                commitments.join("\n"),
                excerpts.join("\n\n")
            ),
        },
    ]
}

/// Reads the model's reply: verdicts for known commitments only, done or
/// slipped, at most one each.
pub fn parse_verdicts(reply: &str, count: usize) -> Result<Vec<Verdict>> {
    let value: Value = serde_json::from_str(crate::extraction::strip_code_fences_pub(reply))?;
    let Some(results) = value.get("results").and_then(Value::as_array) else {
        bail!("Expected a results array");
    };
    let mut verdicts: Vec<Verdict> = Vec::new();
    for r in results {
        let index = r
            .get("id")
            .and_then(Value::as_str)
            .and_then(|id| {
                id.trim()
                    .trim_start_matches(['C', 'c'])
                    .parse::<usize>()
                    .ok()
            })
            .and_then(|n| n.checked_sub(1))
            .filter(|i| *i < count);
        let status = r
            .get("status")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_lowercase())
            .filter(|s| s == "done" || s == "slipped");
        let (Some(index), Some(status)) = (index, status) else {
            continue;
        };
        if verdicts.iter().any(|v| v.index == index) {
            continue;
        }
        let quote = r
            .get("quote")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|q| !q.is_empty())
            .map(|q| q.chars().take(MAX_QUOTE_CHARS).collect());
        verdicts.push(Verdict {
            index,
            status,
            timestamp_ms: r.get("timestamp_ms").and_then(Value::as_i64),
            quote,
        });
    }
    Ok(verdicts)
}

/// Asks the model about `check` and records what it found. Returns how
/// many commitments were marked done and slipped.
pub async fn run(
    db: &Database,
    llm: &LlmRegistry,
    provider: &str,
    model: &str,
    check: &Check,
) -> Result<(usize, usize)> {
    let reply = crate::ops::chat(llm, provider, model, prompt(check)).await?;
    let verdicts = parse_verdicts(&reply, check.commitments.len()).map_err(|e| {
        // The reply quotes the meeting, so only its size is logged.
        tracing::error!(
            "Couldn't read the follow-through check ({} chars): {e}",
            reply.len()
        );
        e
    })?;
    let (mut done, mut slipped) = (0, 0);
    for v in verdicts {
        let (commitment, passages) = &check.commitments[v.index];
        // The moment the model named, if it's inside the passages it was
        // shown; else the first of them.
        let within = |ms: i64| {
            passages.iter().any(|&p| {
                let p = &check.passages[p];
                ms >= p.start_ms && ms <= p.end_ms
            })
        };
        let timestamp = v
            .timestamp_ms
            .filter(|ms| within(*ms))
            .or_else(|| passages.first().map(|&p| check.passages[p].start_ms));
        if db.record_commitment_evidence(
            &commitment.id,
            &check.meeting_id,
            &v.status,
            timestamp,
            v.quote.as_deref(),
        )? {
            match v.status.as_str() {
                "done" => done += 1,
                _ => slipped += 1,
            }
        }
    }
    Ok((done, slipped))
}

/// Checks the open commitments from earlier meetings against `meeting_id`
/// and returns what it showed done or slipped. `engine` adds search by
/// meaning to search by keywords.
pub async fn check_meeting(
    db: &Database,
    llm: &LlmRegistry,
    provider: &str,
    model: &str,
    meeting_id: &str,
    mut engine: Option<&mut crate::embedding::EmbeddingEngine>,
) -> Result<Vec<Commitment>> {
    let check = gather(db, meeting_id, |text| {
        engine.as_deref_mut().and_then(|e| e.embed(text).ok())
    })?;
    if let Some(check) = check {
        run(db, llm, provider, model, &check).await?;
    }
    Ok(db.commitment_followups(meeting_id, &today())?)
}

/// Sets a commitment's status by hand: done and dropped close its action
/// item, slipped flags it, and open reopens it without the flag.
pub fn set_status(db: &Database, id: &str, status: &str) -> Result<Commitment> {
    crate::ops::validate_one_of("commitment status", status, STATUSES)?;
    db.get_insight_by_action_item(id)?;
    match status {
        "done" => db.update_action_item_status(id, "done")?,
        "dropped" => db.update_action_item_status(id, "cancelled")?,
        _ => {
            db.update_action_item_status(id, "open")?;
            db.set_action_item_slipped(id, status == "slipped")?;
        }
    }
    db.get_commitment(id, &today())?
        .ok_or_else(|| anyhow::anyhow!("Action item {id} has no owner, so it isn't a commitment"))
}

/// "2 meetings ago", counting the meetings recorded since.
fn age(meetings_since: i64) -> String {
    match meetings_since {
        0 => "in your last meeting".to_string(),
        1 => "1 meeting ago".to_string(),
        n => format!("{n} meetings ago"),
    }
}

/// "Oct 3", from a stored meeting time.
fn short_date(time: &str) -> Option<String> {
    let at = chrono::DateTime::parse_from_rfc3339(time).ok()?;
    Some(
        at.with_timezone(&chrono::Local)
            .format("%b %-d")
            .to_string(),
    )
}

/// "Priya committed to send the deck 2 meetings ago (Oct 3)".
pub fn reminder_text(c: &Commitment) -> String {
    let content = c.content.trim().trim_end_matches('.');
    let mut chars = content.chars();
    // "Send the deck" reads as "send the deck"; "API docs" stays as it is.
    let what = match (chars.next(), chars.next()) {
        (Some(first), Some(second)) if first.is_uppercase() && second.is_lowercase() => {
            first.to_lowercase().collect::<String>() + &content[first.len_utf8()..]
        }
        _ => content.to_string(),
    };
    let mut text = format!("{} committed to {what} {}", c.owner, age(c.meetings_since));
    if let Some(date) = short_date(&c.meeting_start_time) {
        text.push_str(&format!(" ({date})"));
    }
    if c.status == "slipped" {
        text.push_str(". It has slipped");
    }
    text
}

/// Of the `pending` commitments, those from other meetings to bring up while `speaker` says
/// `text` in a recording: theirs, or ones whose topic it touches. Skips the
/// ids in `reminded`; your own only come up by topic.
pub fn reminders<'a>(
    pending: &'a [Commitment],
    meeting_id: &str,
    speaker: &str,
    text: &str,
    reminded: &HashSet<String>,
) -> Vec<&'a Commitment> {
    let speaker_is_named = !crate::diarization::is_automatic_label(speaker);
    pending
        .iter()
        .filter(|c| c.meeting_id != meeting_id && !reminded.contains(&c.id))
        .filter(|c| {
            (speaker_is_named && same_person(&c.owner, speaker))
                || shared_words(&topic_words(&c.content), text) >= TOPIC_WORDS
        })
        .take(MAX_REMINDERS)
        .collect()
}

/// Where a commitment was made, as a source for a Live Assist card.
pub fn source(c: &Commitment) -> Value {
    let start_ms = c.transcript_start_ms.unwrap_or(0);
    json!({
        "type": "meeting",
        "meeting_id": c.meeting_id,
        "meeting_title": c.meeting_title,
        "start_ms": start_ms,
        "end_ms": start_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewActionItem, NewInsight, NewMeeting, NewTranscriptSegment};

    #[test]
    fn status_follows_the_action_item_and_due_date() {
        let today = "2026-10-20";
        assert_eq!(follow_through_status("open", false, None, today), "open");
        assert_eq!(follow_through_status("open", true, None, today), "slipped");
        assert_eq!(
            follow_through_status("open", false, Some("2026-10-19"), today),
            "slipped"
        );
        assert_eq!(
            follow_through_status("open", false, Some("2026-10-20"), today),
            "open"
        );
        assert_eq!(
            follow_through_status("done", true, Some("2026-01-01"), today),
            "done"
        );
        assert_eq!(
            follow_through_status("cancelled", false, None, today),
            "dropped"
        );
    }

    #[test]
    fn names_match_by_first_name_and_you_is_me() {
        assert!(same_person("Priya", "priya shah"));
        assert!(same_person("Priya Shah", "Priya"));
        assert!(same_person("me", "You"));
        assert!(!same_person("Priya Shah", "Priya Patel"));
        assert!(!same_person("Sam", "Samantha"));
        assert!(!same_person("", "Sam"));
    }

    #[test]
    fn verdicts_keep_known_commitments_that_changed() {
        let reply = r#"```json
        {"results": [
            {"id": "C2", "status": "done", "timestamp_ms": 61000, "quote": "I sent the deck Friday"},
            {"id": "C1", "status": "open"},
            {"id": "C9", "status": "done"},
            {"id": "C3", "status": "Slipped", "quote": ""},
            {"id": "C2", "status": "slipped"}
        ]}
        ```"#;
        let verdicts = parse_verdicts(reply, 3).unwrap();
        assert_eq!(
            verdicts,
            vec![
                Verdict {
                    index: 1,
                    status: "done".into(),
                    timestamp_ms: Some(61000),
                    quote: Some("I sent the deck Friday".into()),
                },
                Verdict {
                    index: 2,
                    status: "slipped".into(),
                    timestamp_ms: None,
                    quote: None,
                },
            ]
        );
        assert!(parse_verdicts("not json", 3).is_err());
    }

    #[test]
    fn reminder_reads_naturally() {
        let mut c = commitment("Priya", "Send the pricing deck to Acme.");
        c.meetings_since = 2;
        c.meeting_start_time = "2026-10-03T15:00:00+00:00".into();
        let text = reminder_text(&c);
        assert!(
            text.starts_with("Priya committed to send the pricing deck to Acme 2 meetings ago ("),
            "{text}"
        );
        c.content = "API docs for the beta".into();
        c.status = "slipped".into();
        assert!(reminder_text(&c).contains("to API docs for the beta"));
        assert!(reminder_text(&c).ends_with("It has slipped"));
    }

    #[test]
    fn reminders_follow_the_speaker_or_the_topic() {
        let pending = vec![
            commitment("Priya", "Send the pricing deck to Acme"),
            commitment("You", "Book the offsite venue"),
        ];
        let none = HashSet::new();
        let ids =
            |found: Vec<&Commitment>| found.iter().map(|c| c.owner.clone()).collect::<Vec<_>>();
        assert_eq!(
            ids(reminders(
                &pending,
                "live",
                "Priya Shah",
                "Morning all.",
                &none
            )),
            ["Priya"]
        );
        // Your own commitments come up by topic, not because you spoke.
        assert!(reminders(&pending, "live", "You", "Morning all.", &none).is_empty());
        assert_eq!(
            ids(reminders(
                &pending,
                "live",
                "Speaker 2",
                "Did we pick an offsite venue yet?",
                &none
            )),
            ["You"]
        );
        let reminded: HashSet<String> = [pending[0].id.clone()].into();
        assert!(reminders(&pending, "live", "Priya", "Hi", &reminded).is_empty());
        // Nor are commitments made in the meeting being recorded.
        assert!(reminders(&pending, "m1", "Priya", "Hi", &none).is_empty());
    }

    fn commitment(owner: &str, content: &str) -> Commitment {
        Commitment {
            id: uuid::Uuid::new_v4().to_string(),
            owner: owner.into(),
            content: content.into(),
            due_date: None,
            status: "open".into(),
            meeting_id: "m1".into(),
            meeting_title: "Weekly sync".into(),
            meeting_start_time: "2026-10-03T15:00:00+00:00".into(),
            transcript_start_ms: Some(1000),
            meetings_since: 0,
            evidence: None,
        }
    }

    /// Answers every check with a canned reply, and keeps what it was asked.
    struct FakeLlm {
        reply: String,
        asked: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    }

    #[async_trait::async_trait]
    impl crate::llm::LlmProvider for FakeLlm {
        fn provider_name(&self) -> &str {
            "fake"
        }
        fn available_models(&self) -> Vec<crate::llm::ModelInfo> {
            Vec::new()
        }
        async fn chat(&self, messages: Vec<ChatMessage>, _model: &str) -> Result<String> {
            self.asked.lock().unwrap().push(messages[1].content.clone());
            Ok(self.reply.clone())
        }
    }

    fn meeting_with(db: &Database, title: &str, lines: &[(&str, &str)]) -> String {
        let id = db
            .create_meeting(NewMeeting {
                title: title.into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap()
            .id;
        for (i, (speaker, text)) in lines.iter().enumerate() {
            db.create_transcript_segment(NewTranscriptSegment {
                meeting_id: id.clone(),
                speaker_label: speaker.to_string(),
                text: text.to_string(),
                start_ms: i as i64 * 60_000,
                end_ms: i as i64 * 60_000 + 50_000,
                confidence: 0.9,
            })
            .unwrap();
        }
        db.update_meeting_status(&id, "summarized").unwrap();
        id
    }

    fn action_item(db: &Database, meeting_id: &str, owner: Option<&str>, content: &str) -> String {
        let insight = db
            .create_insight(NewInsight {
                meeting_id: meeting_id.into(),
                insight_type: "action_item".into(),
                content: content.into(),
                context: None,
                transcript_start_ms: Some(0),
                transcript_end_ms: None,
            })
            .unwrap();
        db.create_action_item(NewActionItem {
            insight_id: insight.id,
            assignee: owner.map(Into::into),
            due_date: None,
        })
        .unwrap()
        .id
    }

    #[test]
    fn a_later_meeting_closes_and_slips_commitments() {
        let db = Database::new_in_memory().unwrap();
        let earlier = meeting_with(&db, "Acme kickoff", &[("Priya", "I'll send the deck.")]);
        let deck = action_item(
            &db,
            &earlier,
            Some("Priya"),
            "Send the pricing deck to Acme",
        );
        let contract = action_item(
            &db,
            &earlier,
            Some("Sam"),
            "Review the Acme contract redlines",
        );
        let venue = action_item(&db, &earlier, Some("Lee"), "Book the offsite venue");
        // No owner, so not a commitment.
        action_item(&db, &earlier, None, "Someone should update the wiki");

        let later = meeting_with(
            &db,
            "Acme follow-up",
            &[
                (
                    "Priya",
                    "Quick update: I sent the pricing deck to Acme on Friday.",
                ),
                (
                    "Speaker 2",
                    "The contract redlines review is still not done, legal is blocked.",
                ),
                ("Priya", "Let's talk about hiring next."),
            ],
        );
        // A commitment made in the meeting being checked isn't checked.
        action_item(&db, &later, Some("Priya"), "Share the hiring plan");

        let check = gather(&db, &later, |_| None).unwrap().unwrap();
        let checked: Vec<&str> = check
            .commitments
            .iter()
            .map(|(c, _)| c.id.as_str())
            .collect();
        // Priya was there; the contract came up though Sam wasn't; nobody
        // mentioned the venue and Lee wasn't there.
        assert!(checked.contains(&deck.as_str()));
        assert!(checked.contains(&contract.as_str()));
        assert!(!checked.contains(&venue.as_str()));
        assert_eq!(check.commitments.len(), 2);
        assert!(check.passages.len() <= 2 * PASSAGES_PER_COMMITMENT);

        let deck_index = checked.iter().position(|id| *id == deck).unwrap() + 1;
        let contract_index = checked.iter().position(|id| *id == contract).unwrap() + 1;
        let asked = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let mut llm = LlmRegistry::new();
        llm.register(Box::new(FakeLlm {
            reply: format!(
                r#"{{"results": [
                    {{"id": "C{deck_index}", "status": "done", "timestamp_ms": 1000, "quote": "I sent the pricing deck to Acme on Friday."}},
                    {{"id": "C{contract_index}", "status": "slipped", "timestamp_ms": 99999999, "quote": "still not done"}}
                ]}}"#
            ),
            asked: asked.clone(),
        }));
        let rt = tokio::runtime::Runtime::new().unwrap();
        let (done, slipped) = rt.block_on(run(&db, &llm, "fake", "m", &check)).unwrap();
        assert_eq!((done, slipped), (1, 1));
        let prompt = asked.lock().unwrap()[0].clone();
        assert!(prompt.contains("Send the pricing deck to Acme"));
        assert!(!prompt.contains("offsite"));
        assert!(!prompt.contains("hiring plan"));

        let all = list(&db, None, None).unwrap();
        let get = |id: &str| all.iter().find(|c| c.id == id).unwrap().clone();
        assert_eq!(get(&deck).status, "done");
        let evidence = get(&deck).evidence.unwrap();
        assert_eq!(evidence.meeting_id, later);
        assert_eq!(evidence.timestamp_ms, Some(1000));
        assert_eq!(get(&contract).status, "slipped");
        // A moment outside the passages it was shown falls back to theirs.
        assert!(get(&contract).evidence.unwrap().timestamp_ms.unwrap() < 99999999);
        assert_eq!(get(&venue).status, "open");
        assert_eq!(get(&venue).meetings_since, 1);

        let followups = db.commitment_followups(&later, &today()).unwrap();
        assert_eq!(followups.len(), 2);
        assert_eq!(
            list(&db, Some("priya shah"), Some("open")).unwrap().len(),
            1
        );

        // Checking again changes nothing already closed by the check or by hand.
        set_status(&db, &venue, "dropped").unwrap();
        let again = rt.block_on(run(&db, &llm, "fake", "m", &check)).unwrap();
        assert_eq!(again, (0, 1));
        assert_eq!(list(&db, None, Some("dropped")).unwrap().len(), 1);
    }

    #[test]
    fn a_topic_that_comes_up_in_other_words_is_found_by_meaning() {
        let db = Database::new_in_memory().unwrap();
        let earlier = meeting_with(&db, "Planning", &[("Lee", "I'll handle it.")]);
        let venue = action_item(&db, &earlier, Some("Lee"), "Book the offsite venue");
        let later = meeting_with(&db, "Retro", &[("Ana", "Hello."), ("Ana", "Bye.")]);
        let unit = |axis: usize| {
            let mut v = vec![0f32; 384];
            v[axis] = 1.0;
            v
        };
        let chunk = |index: i32, text: &str, axis: usize| {
            (
                crate::db::TranscriptChunk {
                    id: uuid::Uuid::new_v4().to_string(),
                    meeting_id: later.clone(),
                    chunk_index: index,
                    text: text.into(),
                    start_ms: index as i64 * 60_000,
                    end_ms: index as i64 * 60_000 + 50_000,
                    speaker_labels: "[]".into(),
                },
                unit(axis),
            )
        };
        db.insert_embedded_chunks(&[
            chunk(0, "Ana: Budget talk.", 1),
            chunk(1, "Ana: We reserved the lodge for the team retreat.", 2),
        ])
        .unwrap();

        // No shared words and Lee wasn't there: only meaning finds it.
        assert!(gather(&db, &later, |_| None).unwrap().is_none());
        let check = gather(&db, &later, |_| Some(unit(2))).unwrap().unwrap();
        assert_eq!(check.commitments[0].0.id, venue);
        assert!(check.passages.iter().any(|p| p.text.contains("lodge")));
    }

    #[test]
    fn manual_status_changes() {
        let db = Database::new_in_memory().unwrap();
        let meeting = meeting_with(&db, "Sync", &[("Priya", "On it.")]);
        let id = action_item(&db, &meeting, Some("Priya"), "Send the deck");
        assert_eq!(set_status(&db, &id, "slipped").unwrap().status, "slipped");
        assert_eq!(set_status(&db, &id, "open").unwrap().status, "open");
        assert_eq!(set_status(&db, &id, "done").unwrap().status, "done");
        assert_eq!(set_status(&db, &id, "dropped").unwrap().status, "dropped");
        assert!(set_status(&db, &id, "finished").is_err());
        let unowned = action_item(&db, &meeting, None, "Tidy up");
        assert!(set_status(&db, &unowned, "done").is_err());
    }

    #[test]
    fn nothing_to_check_without_earlier_commitments() {
        let db = Database::new_in_memory().unwrap();
        let meeting = meeting_with(&db, "Sync", &[("Priya", "Hello.")]);
        action_item(&db, &meeting, Some("Priya"), "Send the deck");
        assert!(gather(&db, &meeting, |_| None).unwrap().is_none());
    }
}
