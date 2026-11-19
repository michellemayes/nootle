//! Inline note suggestions: while someone writes a meeting's notes, the model
//! they picked proposes how the line they're on goes on, from what was said.
//! The notes editor shows it as ghost text that Tab accepts.

use crate::db::{Database, TranscriptSegment};
use crate::llm::{ChatMessage, LlmRegistry};
use crate::summarization::transcript_lines;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Turns note suggestions on. On unless turned off.
pub const SETTING_KEY: &str = "note_suggestions";

const NOTES_BEFORE_CHARS: usize = 3_000;
const NOTES_AFTER_CHARS: usize = 800;
const TRANSCRIPT_CHARS: usize = 6_000;
const MAX_TEXT_CHARS: usize = 200;
const MAX_BULLET_CHARS: usize = 140;
const MAX_BULLETS: usize = 3;

pub fn enabled(db: &Database) -> bool {
    db.get_bool_setting(SETTING_KEY, true)
}

/// The last `n` characters of `s`.
fn tail(s: &str, n: usize) -> &str {
    let skip = s.chars().count().saturating_sub(n);
    s.char_indices().nth(skip).map_or("", |(i, _)| &s[i..])
}

/// The first `n` characters of `s`.
fn head(s: &str, n: usize) -> &str {
    s.char_indices().nth(n).map_or(s, |(i, _)| &s[..i])
}

fn words(s: &str) -> HashSet<String> {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() > 3)
        .map(str::to_lowercase)
        .collect()
}

/// The transcript lines most relevant to `focus` that fit in `budget`
/// characters, in the order they were said. Lines sharing more words with
/// `focus` come first, then later ones, so a live meeting leans on what was
/// just said.
pub fn relevant_transcript(segments: &[TranscriptSegment], focus: &str, budget: usize) -> String {
    let lines = transcript_lines(segments);
    let total: usize = lines.iter().map(|l| l.len() + 1).sum();
    if total <= budget {
        return lines.join("\n");
    }
    let focus = words(focus);
    let mut ranked: Vec<(usize, usize)> = lines
        .iter()
        .enumerate()
        .map(|(i, line)| (words(line).intersection(&focus).count(), i))
        .collect();
    ranked.sort_unstable_by(|a, b| b.cmp(a));
    let mut used = 0;
    let mut picked: Vec<usize> = Vec::new();
    for (_, i) in ranked {
        let len = lines[i].len() + 1;
        if used + len <= budget {
            used += len;
            picked.push(i);
        }
    }
    picked.sort_unstable();
    picked
        .into_iter()
        .map(|i| lines[i].as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// What to show at the cursor: `text` finishes the line being written and
/// `bullets` are sub-points that go under it. The editor adds the list
/// markers and indentation, so neither carries any.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct NoteSuggestion {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub bullets: Vec<String>,
}

/// The line the cursor is on: the text after the last newline in `before`.
fn current_line(before: &str) -> &str {
    before.rsplit_once('\n').map_or(before, |(_, line)| line)
}

pub fn prompt(title: &str, before: &str, after: &str, transcript: &str) -> String {
    let transcript = if transcript.is_empty() {
        "(no transcript yet)"
    } else {
        transcript
    };
    format!(
        "You help someone write their Markdown notes for the meeting \"{title}\" as they \
         type. ⟨CURSOR⟩ marks where they are.\n\n\
         <transcript>\n{transcript}\n</transcript>\n\n\
         <notes>\n{}⟨CURSOR⟩{}\n</notes>\n\n\
         Suggest what goes at the cursor, as JSON: {{\"text\": \"…\", \"bullets\": [\"…\"]}}\n\
         - text: the words that go right at the cursor to finish the line they're on. On an \
         empty line, the next note in the same style as the lines around it. Begin with a \
         space if it starts a new word. Under 20 words, no list marker.\n\
         - bullets: up to {MAX_BULLETS} short sub-points that belong under that line, such as \
         the details, numbers, owners or dates the transcript gives for it. No list markers. \
         Leave it empty when the line doesn't need any.\n\n\
         Use only what the transcript and notes say; never invent anything, and don't repeat \
         a point the notes already make. Write like they do: fragments if they write \
         fragments. When there's something useful to add, suggest it. Reply with the JSON \
         only. If there's truly nothing to add, reply {{\"text\": \"\", \"bullets\": []}}.",
        tail(before, NOTES_BEFORE_CHARS),
        head(after, NOTES_AFTER_CHARS),
    )
}

/// `line` without its indentation and leading list, task or heading marker.
fn strip_marker(line: &str) -> &str {
    let t = line.trim_start();
    for marker in ["- [ ] ", "- [x] ", "- ", "* ", "• ", "> "] {
        if let Some(rest) = t.strip_prefix(marker) {
            return rest;
        }
    }
    let hashes = t.len() - t.trim_start_matches('#').len();
    if hashes > 0 && t[hashes..].starts_with(' ') {
        return &t[hashes + 1..];
    }
    let digits = t.len() - t.trim_start_matches(|c: char| c.is_ascii_digit()).len();
    if digits > 0 && (t[digits..].starts_with(". ") || t[digits..].starts_with(") ")) {
        return &t[digits + 2..];
    }
    t
}

fn unquote(s: &str) -> &str {
    s.trim()
        .trim_matches(|c| c == '"' || c == '“' || c == '”' || c == '`')
}

// truncate_at_word_boundary trims short input, which would drop a leading space.
fn cap(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        crate::ops::truncate_at_word_boundary(s, max, "")
    }
}

/// The JSON object in a reply, wherever the model put it.
fn parse_reply(reply: &str) -> NoteSuggestion {
    let json = match (reply.find('{'), reply.rfind('}')) {
        (Some(start), Some(end)) if start < end => serde_json::from_str(&reply[start..=end]).ok(),
        _ => None,
    };
    json.unwrap_or_else(|| NoteSuggestion {
        text: reply
            .lines()
            .find(|l| !l.trim().is_empty() && !l.trim_start().starts_with("```"))
            .map(|l| unquote(l).to_string())
            .unwrap_or_default(),
        bullets: Vec::new(),
    })
}

/// The text to insert right after `typed`, the cursor's line so far.
fn clean_text(text: &str, typed: &str) -> String {
    let typed_words = strip_marker(typed).trim();
    let mut text = text.trim_end();
    // A reply that repeats the line's start despite being asked not to.
    let start = text.trim_start();
    let echo = head(start, typed_words.chars().count());
    if typed_words.chars().count() >= 3 && echo.to_lowercase() == typed_words.to_lowercase() {
        text = &start[echo.len()..];
    }
    if typed_words.is_empty() {
        text = strip_marker(text);
    }
    let text = if typed_words.is_empty() || typed.ends_with(char::is_whitespace) {
        text.trim_start().to_string()
    } else if typed.ends_with([',', ';', ':', '.', '!', '?', ')'])
        && text.starts_with(char::is_alphanumeric)
    {
        format!(" {text}")
    } else {
        text.to_string()
    };
    if text.trim().is_empty() {
        return String::new();
    }
    cap(&text, MAX_TEXT_CHARS)
}

/// A model reply as a suggestion for the cursor's line, or None when it adds
/// nothing. Sub-points the notes already hold are dropped.
pub fn suggestion(reply: &str, before: &str, after: &str) -> Option<NoteSuggestion> {
    let parsed = parse_reply(reply);
    let text = clean_text(&parsed.text, current_line(before));
    let notes = format!("{before}\n{after}").to_lowercase();
    let mut bullets: Vec<String> = Vec::new();
    for bullet in &parsed.bullets {
        let bullet = cap(unquote(strip_marker(bullet)), MAX_BULLET_CHARS);
        let key = bullet.to_lowercase();
        if bullet.is_empty()
            || notes.contains(&key)
            || bullets.iter().any(|b| b.to_lowercase() == key)
        {
            continue;
        }
        bullets.push(bullet);
        if bullets.len() == MAX_BULLETS {
            break;
        }
    }
    (!text.is_empty() || !bullets.is_empty()).then_some(NoteSuggestion { text, bullets })
}

/// A suggestion for the cursor in a meeting's notes, or None when the model
/// has nothing to add. `before` and `after` are the notes either side of the
/// cursor, as Markdown lines.
pub async fn suggest(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    before: &str,
    after: &str,
    provider: &str,
    model: &str,
) -> Result<Option<NoteSuggestion>> {
    if !enabled(db) || crate::llm::local_only_enabled(db) && !crate::llm::runs_locally(provider) {
        return Ok(None);
    }
    let meeting = db.get_meeting(meeting_id)?;
    let segments = db.get_transcript(meeting_id)?;
    if segments.is_empty() && before.trim().is_empty() {
        return Ok(None);
    }
    let focus = format!("{} {}", meeting.title, tail(before, 400));
    let transcript = relevant_transcript(&segments, &focus, TRANSCRIPT_CHARS);
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: prompt(&meeting.title, before, after, &transcript),
    }];
    let reply = crate::ops::chat(llm, provider, model, messages).await?;
    Ok(suggestion(&reply, before, after))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(speaker: &str, start_ms: i64, text: &str) -> TranscriptSegment {
        TranscriptSegment {
            id: String::new(),
            meeting_id: "m".into(),
            speaker_label: speaker.into(),
            text: text.into(),
            start_ms,
            end_ms: start_ms + 1_000,
            confidence: 1.0,
        }
    }

    fn text(reply: &str, before: &str) -> Option<String> {
        suggestion(reply, before, "").map(|s| s.text)
    }

    #[test]
    fn continues_the_typed_line() {
        assert_eq!(
            text(
                r#"{"text": " moves to March 14", "bullets": []}"#,
                "Launch\n- Ship date"
            )
            .as_deref(),
            Some(" moves to March 14")
        );
    }

    #[test]
    fn keeps_a_word_in_progress_joined() {
        assert_eq!(
            text(r#"{"text": "ed at $40k"}"#, "Budget approv").as_deref(),
            Some("ed at $40k")
        );
    }

    #[test]
    fn drops_the_space_already_typed() {
        assert_eq!(
            text(r#"{"text": " Sam"}"#, "Owner: ").as_deref(),
            Some("Sam")
        );
    }

    #[test]
    fn spaces_after_punctuation() {
        assert_eq!(
            text(r#"{"text": "Sam"}"#, "Owner:").as_deref(),
            Some(" Sam")
        );
    }

    #[test]
    fn strips_an_echo_of_the_line() {
        assert_eq!(
            text(r#"{"text": "Pricing: tiered, three plans"}"#, "- Pricing:").as_deref(),
            Some(" tiered, three plans")
        );
    }

    #[test]
    fn new_note_on_an_empty_line_has_no_marker() {
        assert_eq!(
            text(
                r#"{"text": "- Follow up with legal by Friday"}"#,
                "- Notes\n- "
            )
            .as_deref(),
            Some("Follow up with legal by Friday")
        );
    }

    #[test]
    fn bullets_lose_markers_and_repeats() {
        let s = suggestion(
            r#"{"text": "", "bullets": ["- Priya owns it", "• due Friday", "due friday", "", "Already noted"]}"#,
            "Launch\n- Already noted\n- Ship date",
            "",
        )
        .unwrap();
        assert_eq!(s.text, "");
        assert_eq!(s.bullets, vec!["Priya owns it", "due Friday"]);
    }

    #[test]
    fn at_most_three_bullets() {
        let s = suggestion(r#"{"bullets": ["a1", "b2", "c3", "d4"]}"#, "Plan", "").unwrap();
        assert_eq!(s.bullets.len(), MAX_BULLETS);
    }

    #[test]
    fn json_inside_fences_and_prose() {
        let s = suggestion(
            "Here you go:\n```json\n{\"text\": \" vendor delay\", \"bullets\": [\"Acme slips two weeks\"]}\n```",
            "Risks:",
            "",
        )
        .unwrap();
        assert_eq!(s.text, " vendor delay");
        assert_eq!(s.bullets, vec!["Acme slips two weeks"]);
    }

    #[test]
    fn plain_text_reply_still_works() {
        assert_eq!(
            text("\"ready Thursday\"", "Copy ").as_deref(),
            Some("ready Thursday")
        );
    }

    #[test]
    fn nothing_to_add() {
        assert_eq!(
            suggestion(r#"{"text": "", "bullets": []}"#, "Ship date", ""),
            None
        );
        assert_eq!(suggestion("", "Ship date", ""), None);
        assert_eq!(suggestion(r#"{"text": "   "}"#, "Ship date", ""), None);
    }

    #[test]
    fn caps_long_text_at_a_word() {
        let reply = format!(r#"{{"text": " {}"}}"#, "word ".repeat(100));
        let t = text(&reply, "Notes").unwrap();
        assert!(t.chars().count() <= MAX_TEXT_CHARS);
        assert!(t.ends_with("word"));
    }

    #[test]
    fn short_transcripts_are_sent_whole() {
        let segments = [seg("Priya", 0, "Hello."), seg("Sam", 5_000, "Hi.")];
        let t = relevant_transcript(&segments, "", 1_000);
        assert!(t.contains("Priya: Hello.") && t.contains("Sam: Hi."));
    }

    #[test]
    fn long_transcripts_keep_lines_about_the_focus_in_order() {
        let segments: Vec<_> = (0..200)
            .map(|i| {
                let text = match i {
                    20 => "The pricing tiers need another pass.".to_string(),
                    150 => "Pricing goes live in March.".to_string(),
                    _ => format!("Filler remark number {i} about nothing."),
                };
                seg(if i % 2 == 0 { "Priya" } else { "Sam" }, i * 10_000, &text)
            })
            .collect();
        let t = relevant_transcript(&segments, "pricing", 400);
        assert!(t.len() <= 400);
        let tiers = t.find("pricing tiers").expect("early match kept");
        let march = t.find("live in March").expect("late match kept");
        assert!(tiers < march);
    }

    #[test]
    fn tail_and_head_respect_characters() {
        assert_eq!(tail("héllo", 3), "llo");
        assert_eq!(tail("hi", 5), "hi");
        assert_eq!(head("héllo", 2), "hé");
        assert_eq!(head("hi", 5), "hi");
    }

    #[test]
    fn prompt_marks_the_cursor() {
        let p = prompt(
            "Launch sync",
            "- Ship date",
            "\nRisks",
            "[00:00] Priya: Friday.",
        );
        assert!(p.contains("- Ship date⟨CURSOR⟩\nRisks"));
        assert!(p.contains("Launch sync"));
    }
}
