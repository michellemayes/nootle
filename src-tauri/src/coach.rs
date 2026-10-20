//! Meeting Coach: a private look at how you ("You", the microphone side of
//! a call) showed up in a meeting, and how that changes over time. Metrics
//! come from the transcript on this Mac; the optional tip is written by the
//! selected model from the numbers alone, never the transcript.
//!
//! Coach data is only for the app's own Coach card and trends: it is never
//! added to exports, share links, workflows or the MCP server.

use crate::analytics::{interrupts, turns};
use crate::db::{Database, TranscriptSegment};
use crate::diarization::SELF_LABEL;
use crate::llm::{ChatMessage, LlmRegistry};
use anyhow::{bail, Result};
use serde::Serialize;
use std::collections::HashMap;

/// Turns on the Coach card and trends. Off unless turned on.
pub const SETTING_KEY: &str = "meeting_coach";

/// Filler words and phrases, lowercase. "like", "kind of", "sort of",
/// "you know" and "I mean" are also ordinary words; `filler_at` only counts
/// them where they're used as filler.
pub const FILLERS: &[&[&str]] = &[
    &["um"],
    &["umm"],
    &["uh"],
    &["uhh"],
    &["erm"],
    &["like"],
    &["you", "know"],
    &["sort", "of"],
    &["kind", "of"],
    &["basically"],
    &["literally"],
    &["i", "mean"],
];

/// A turn longer than this counts as a monologue.
pub const LONG_MONOLOGUE_MS: i64 = 2 * 60_000;

/// Words that make "kind of" / "sort of" a real noun phrase ("what kind of").
const KIND_OF_DETERMINERS: &[&str] = &[
    "a",
    "an",
    "the",
    "what",
    "which",
    "this",
    "that",
    "these",
    "those",
    "any",
    "some",
    "every",
    "each",
    "one",
    "no",
    "same",
    "other",
    "another",
    "different",
    "my",
    "your",
    "our",
    "their",
    "his",
    "her",
    "its",
    "all",
];
/// Words that make "you know" a real question or clause ("do you know").
const YOU_KNOW_LEADS: &[&str] = &[
    "do", "did", "does", "don't", "didn't", "if", "as", "what", "how", "would", "will", "could",
];

/// How you showed up in one meeting.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CoachMetrics {
    /// Your share of all speaking time, 0–1.
    pub talk_share: f64,
    pub talk_time_ms: i64,
    pub words: i64,
    pub words_per_minute: f64,
    /// Times you started talking while someone else was mid-turn.
    pub interruptions: i64,
    /// Times someone started talking while you were mid-turn.
    pub times_interrupted: i64,
    pub questions: i64,
    pub statements: i64,
    pub filler_count: i64,
    pub fillers_per_minute: f64,
    /// Fillers you used, most used first.
    pub top_fillers: Vec<(String, i64)>,
    pub longest_monologue_ms: i64,
    /// Turns over `LONG_MONOLOGUE_MS`.
    pub long_monologues: i64,
}

/// The Coach card for one meeting.
#[derive(Debug, Clone, Serialize)]
pub struct MeetingCoach {
    pub metrics: CoachMetrics,
    pub tip: Option<String>,
}

/// One meeting on the trends chart.
#[derive(Debug, Clone, Serialize)]
pub struct CoachTrendPoint {
    pub meeting_id: String,
    pub title: String,
    pub start_time: String,
    #[serde(flatten)]
    pub metrics: CoachMetrics,
}

pub fn enabled(db: &Database) -> bool {
    db.get_bool_setting(SETTING_KEY, false)
}

fn ensure_enabled(db: &Database) -> Result<()> {
    if !enabled(db) {
        bail!("Meeting Coach is off. Turn it on in Settings → Recording.");
    }
    Ok(())
}

/// Your metrics for a meeting's transcript, or `None` when none of it is
/// yours (only calls record you on a channel of your own).
pub fn metrics(segments: &[TranscriptSegment]) -> Option<CoachMetrics> {
    let turns = turns(
        segments
            .iter()
            .map(|s| (s.speaker_label.as_str(), s.start_ms, s.end_ms)),
    );
    let mine: Vec<_> = turns.iter().filter(|t| t.speaker == SELF_LABEL).collect();
    if mine.is_empty() {
        return None;
    }
    let total_speech: i64 = turns.iter().map(|t| t.speech_ms).sum();
    let talk_time_ms: i64 = mine.iter().map(|t| t.speech_ms).sum();
    let spans: Vec<i64> = mine.iter().map(|t| t.end_ms - t.start_ms).collect();

    let (mut interruptions, mut times_interrupted) = (0, 0);
    for pair in turns.windows(2) {
        if !interrupts(&pair[0], &pair[1]) {
            continue;
        }
        if pair[1].speaker == SELF_LABEL {
            interruptions += 1;
        } else if pair[0].speaker == SELF_LABEL {
            times_interrupted += 1;
        }
    }

    let text = segments
        .iter()
        .filter(|s| s.speaker_label == SELF_LABEL)
        .map(|s| s.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let words = text.split_whitespace().count() as i64;
    let (questions, statements) = count_sentences(&text);
    let top_fillers = count_fillers(&text);
    let filler_count = top_fillers.iter().map(|(_, n)| n).sum();

    let minutes = talk_time_ms as f64 / 60_000.0;
    let per_minute = |n: i64| {
        if minutes > 0.0 {
            n as f64 / minutes
        } else {
            0.0
        }
    };
    Some(CoachMetrics {
        talk_share: if total_speech > 0 {
            talk_time_ms as f64 / total_speech as f64
        } else {
            0.0
        },
        talk_time_ms,
        words,
        words_per_minute: per_minute(words),
        interruptions,
        times_interrupted,
        questions,
        statements,
        filler_count,
        fillers_per_minute: per_minute(filler_count),
        top_fillers,
        longest_monologue_ms: spans.iter().copied().max().unwrap_or(0),
        long_monologues: spans.iter().filter(|&&s| s > LONG_MONOLOGUE_MS).count() as i64,
    })
}

/// Questions and statements among the sentences in `text`.
fn count_sentences(text: &str) -> (i64, i64) {
    let (mut questions, mut statements) = (0, 0);
    let mut start = 0;
    for (i, c) in text.char_indices().chain([(text.len(), '.')]) {
        if !matches!(c, '.' | '!' | '?') {
            continue;
        }
        if text[start..i].chars().any(char::is_alphanumeric) {
            if c == '?' {
                questions += 1;
            } else {
                statements += 1;
            }
        }
        start = (i + c.len_utf8()).min(text.len());
    }
    (questions, statements)
}

struct Word {
    text: String,
    /// Followed by a comma.
    comma: bool,
    /// Starts a sentence.
    starts_sentence: bool,
}

fn words(text: &str) -> Vec<Word> {
    let mut out = Vec::new();
    let mut starts_sentence = true;
    for raw in text.split_whitespace() {
        let word: String = raw
            .chars()
            .filter(|c| crate::dictionary::is_word_char(*c))
            .map(|c| if c == '’' { '\'' } else { c })
            .collect::<String>()
            .to_lowercase();
        let ends = raw.trim_end_matches(['"', ')', '\'']);
        if !word.is_empty() {
            out.push(Word {
                text: word,
                comma: ends.ends_with(',') || ends.ends_with('—'),
                starts_sentence,
            });
        }
        starts_sentence = ends.ends_with(['.', '!', '?']);
    }
    out
}

/// The filler starting at `words[i]`, if any, with how many words it spans.
fn filler_at(words: &[Word], i: usize) -> Option<&'static [&'static str]> {
    let prev = i.checked_sub(1).map(|p| &words[p]);
    let prev_word = prev.map(|w| w.text.as_str()).unwrap_or("");
    FILLERS.iter().copied().find(|&filler| {
        let matched = filler
            .iter()
            .enumerate()
            .all(|(k, part)| words.get(i + k).is_some_and(|w| w.text == *part));
        if !matched {
            return false;
        }
        let last = &words[i + filler.len() - 1];
        match filler {
            // "It was, like, huge" / "like, we", not "I like it".
            ["like"] => last.comma || prev.is_some_and(|w| w.comma),
            ["kind" | "sort", "of"] => !KIND_OF_DETERMINERS.contains(&prev_word),
            ["you", "know"] => !YOU_KNOW_LEADS.contains(&prev_word),
            // "I mean, ..." or opening a sentence, not "what I mean is".
            ["i", "mean"] => last.comma || words[i].starts_sentence,
            _ => true,
        }
    })
}

/// How often each filler is used in `text`, most used first.
fn count_fillers(text: &str) -> Vec<(String, i64)> {
    let words = words(text);
    let mut counts: HashMap<String, i64> = HashMap::new();
    let mut i = 0;
    while i < words.len() {
        match filler_at(&words, i) {
            Some(filler) => {
                *counts.entry(filler.join(" ")).or_default() += 1;
                i += filler.len();
            }
            None => i += 1,
        }
    }
    let mut counts: Vec<(String, i64)> = counts.into_iter().collect();
    counts.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    counts
}

/// The Coach card for a meeting: your metrics and any saved tip. `None`
/// when you didn't speak in it.
pub fn meeting_coach(db: &Database, meeting_id: &str) -> Result<Option<MeetingCoach>> {
    ensure_enabled(db)?;
    let Some(metrics) = metrics(&db.get_transcript(meeting_id)?) else {
        return Ok(None);
    };
    Ok(Some(MeetingCoach {
        metrics,
        tip: db.get_coach_tip(meeting_id)?,
    }))
}

/// Your metrics across the last `limit` meetings you spoke in, oldest first.
pub fn trends(db: &Database, limit: usize) -> Result<Vec<CoachTrendPoint>> {
    ensure_enabled(db)?;
    let mut points = Vec::new();
    let meetings = db.meetings_with(SELF_LABEL)?;
    for meeting in meetings
        .into_iter()
        .filter(|m| m.status != "recording")
        .take(limit)
    {
        if let Some(metrics) = metrics(&db.get_transcript(&meeting.id)?) {
            points.push(CoachTrendPoint {
                meeting_id: meeting.id,
                title: meeting.title,
                start_time: meeting.start_time,
                metrics,
            });
        }
    }
    points.reverse();
    Ok(points)
}

/// The prompt for a tip: the numbers only, never what was said.
fn tip_prompt(m: &CoachMetrics) -> String {
    let fillers = if m.top_fillers.is_empty() {
        "none".to_string()
    } else {
        m.top_fillers
            .iter()
            .take(3)
            .map(|(f, n)| format!("\"{f}\" ×{n}"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    format!(
        "Here is how one person spoke in a meeting:\n\
         - Share of the talking: {:.0}%\n\
         - Pace: {:.0} words per minute\n\
         - Interrupted others: {} times; was interrupted: {} times\n\
         - Questions asked: {}; statements: {}\n\
         - Filler words: {:.1} per minute ({fillers})\n\
         - Longest uninterrupted stretch: {:.1} minutes; stretches over 2 minutes: {}\n\n\
         Suggest ONE specific, kind, practical thing they could try in their next meeting, \
         based on whichever number stands out most. One or two sentences, under 40 words, \
         addressed to them as \"you\". No preamble, no list.",
        m.talk_share * 100.0,
        m.words_per_minute,
        m.interruptions,
        m.times_interrupted,
        m.questions,
        m.statements,
        m.fillers_per_minute,
        m.longest_monologue_ms as f64 / 60_000.0,
        m.long_monologues,
    )
}

/// Asks the selected model for one thing to try next time, from this
/// meeting's metrics, and saves it with the meeting.
pub async fn suggest_tip(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
) -> Result<String> {
    ensure_enabled(db)?;
    crate::llm::sync_local_only(db);
    if crate::llm::local_only() && !crate::llm::runs_locally(provider) {
        bail!("Local-only mode is on. Pick a local model (Ollama) to get a coaching tip.");
    }
    let Some(metrics) = metrics(&db.get_transcript(meeting_id)?) else {
        bail!("Nootle couldn't tell which parts of this meeting were you.");
    };
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: tip_prompt(&metrics),
    }];
    let tip = crate::ops::chat(llm, provider, model, messages).await?;
    let tip = tip.trim().trim_matches('"').trim();
    if tip.is_empty() {
        bail!("The model didn't suggest anything. Try again.");
    }
    db.save_coach_tip(meeting_id, tip)?;
    Ok(tip.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(speaker: &str, start_ms: i64, end_ms: i64, text: &str) -> TranscriptSegment {
        TranscriptSegment {
            id: String::new(),
            meeting_id: "m".into(),
            speaker_label: speaker.into(),
            text: text.into(),
            start_ms,
            end_ms,
            confidence: 1.0,
        }
    }

    fn get(segments: &[TranscriptSegment]) -> CoachMetrics {
        metrics(segments).expect("you spoke")
    }

    #[test]
    fn no_metrics_without_you() {
        assert!(metrics(&[seg("Priya", 0, 5_000, "Hello there.")]).is_none());
    }

    #[test]
    fn talk_share_is_your_part_of_all_speech() {
        let m = get(&[
            seg("You", 0, 30_000, "Hi."),
            seg("Priya", 31_000, 121_000, "Hello."),
        ]);
        assert_eq!(m.talk_time_ms, 30_000);
        assert!((m.talk_share - 0.25).abs() < 1e-9);
    }

    #[test]
    fn pace_is_words_per_minute_of_your_speech() {
        let text = "word ".repeat(150);
        let m = get(&[seg("You", 0, 60_000, &text)]);
        assert_eq!(m.words, 150);
        assert!((m.words_per_minute - 150.0).abs() < 1e-9);
    }

    #[test]
    fn counts_interruptions_both_ways() {
        let m = get(&[
            seg("Priya", 0, 10_000, "So the plan is"),
            // You cut in before Priya finished.
            seg("You", 9_000, 14_000, "Wait, what about pricing?"),
            // Priya cuts in on you.
            seg("Priya", 13_500, 20_000, "We covered that."),
            // A reply after a pause isn't an interruption.
            seg("You", 21_000, 25_000, "Okay."),
            // Neither is a short "yeah" over someone.
            seg("Sam", 26_000, 40_000, "Next topic."),
            seg("You", 30_000, 30_500, "Yeah."),
        ]);
        assert_eq!(m.interruptions, 1);
        assert_eq!(m.times_interrupted, 1);
    }

    #[test]
    fn starting_right_as_someone_stops_counts_as_cutting_in() {
        let m = get(&[
            seg("Priya", 0, 10_000, "and then we"),
            seg("You", 10_050, 15_000, "Right, so here's the thing."),
        ]);
        assert_eq!(m.interruptions, 1);
    }

    #[test]
    fn splits_questions_from_statements() {
        let m = get(&[seg(
            "You",
            0,
            10_000,
            "Can we ship Friday? I think so. Great! What's blocking it?",
        )]);
        assert_eq!((m.questions, m.statements), (2, 2));
        assert_eq!(count_sentences("no punctuation at all"), (0, 1));
        assert_eq!(count_sentences("..."), (0, 0));
    }

    #[test]
    fn counts_fillers_per_minute() {
        let m = get(&[seg(
            "You",
            0,
            30_000,
            "Um, so basically we, like, need to, uh, you know, kind of rethink it.",
        )]);
        assert_eq!(m.filler_count, 6);
        assert!((m.fillers_per_minute - 12.0).abs() < 1e-9);
    }

    #[test]
    fn real_uses_of_filler_words_dont_count() {
        let fillers = count_fillers(
            "I like that idea. What kind of tool is it? Do you know the answer? \
             That's what I mean by it. It's a sort of bridge.",
        );
        assert!(fillers.is_empty(), "{fillers:?}");
        let fillers = count_fillers("I mean, it was like, fine. I mean it works, you know?");
        assert_eq!(
            fillers,
            vec![
                ("i mean".to_string(), 2),
                ("like".into(), 1),
                ("you know".into(), 1)
            ]
        );
    }

    #[test]
    fn finds_longest_and_long_monologues() {
        let m = get(&[
            // Three minutes of you, one sentence after another.
            seg("You", 0, 60_000, "One."),
            seg("You", 61_000, 120_000, "Two."),
            seg("You", 121_000, 180_000, "Three."),
            seg("Priya", 181_000, 190_000, "Okay."),
            seg("You", 191_000, 221_000, "Short."),
            seg("Priya", 222_000, 230_000, "Sure."),
            seg("You", 231_000, 371_000, "Long again."),
        ]);
        assert_eq!(m.longest_monologue_ms, 180_000);
        assert_eq!(m.long_monologues, 2);
    }

    #[test]
    fn tip_prompt_has_numbers_not_words_spoken() {
        let m = get(&[seg(
            "You",
            0,
            60_000,
            "Our secret launch codename is Falcon, um.",
        )]);
        let prompt = tip_prompt(&m);
        assert!(!prompt.contains("Falcon"));
        assert!(prompt.contains("\"um\" ×1"));
    }

    #[test]
    fn coach_is_off_by_default() {
        let db = Database::new_in_memory().unwrap();
        assert!(meeting_coach(&db, "m").is_err());
        assert!(trends(&db, 10).is_err());
        db.set_setting(SETTING_KEY, "true").unwrap();
        assert!(trends(&db, 10).unwrap().is_empty());
    }
}
