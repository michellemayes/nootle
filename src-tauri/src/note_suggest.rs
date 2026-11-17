//! Inline note suggestions: while someone writes a meeting's notes, the model
//! they picked proposes how the line they're on goes on, from what was said.
//! The notes editor shows it as ghost text that Tab accepts.

use crate::db::{Database, TranscriptSegment};
use crate::llm::{ChatMessage, LlmRegistry};
use crate::summarization::transcript_lines;
use anyhow::Result;
use std::collections::HashSet;

/// Turns note suggestions on. On unless turned off.
pub const SETTING_KEY: &str = "note_suggestions";

const NOTES_BEFORE_CHARS: usize = 3_000;
const NOTES_AFTER_CHARS: usize = 800;
const TRANSCRIPT_CHARS: usize = 6_000;
const MAX_SUGGESTION_CHARS: usize = 200;
const NOTHING: &str = "NONE";

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
        "You help someone write their notes for the meeting \"{title}\" as they type. \
         ⟨CURSOR⟩ marks where they are.\n\n\
         <transcript>\n{transcript}\n</transcript>\n\n\
         <notes>\n{}⟨CURSOR⟩{}\n</notes>\n\n\
         Finish the line the cursor is on, or if that line is empty, write the next note. \
         Use what the transcript says: names, numbers, dates, decisions, owners. \
         Never invent anything, and don't repeat a point the notes already make. \
         Match how they write: fragments if they write fragments.\n\n\
         Reply with only the whole line as it should read: start with exactly the text \
         already on that line before the cursor, then your addition of at most 20 words. \
         One line, keeping any list marker the line has but adding none; no quotes, \
         no explanation. \
         If there's nothing worth adding, reply {NOTHING}.",
        tail(before, NOTES_BEFORE_CHARS),
        head(after, NOTES_AFTER_CHARS),
    )
}

/// Strips a leading list or heading marker the model added.
fn strip_marker(s: &str) -> &str {
    let t = s.trim_start();
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

/// The text to insert at the cursor, from the model's reply: the reply's
/// first line minus what's already on the cursor's line. None when the reply
/// adds nothing or rewrites the line instead of continuing it.
pub fn continuation(reply: &str, before: &str) -> Option<String> {
    let line = reply
        .lines()
        .map(str::trim_end)
        .find(|l| !l.trim().is_empty() && !l.trim_start().starts_with("```"))?;
    let line = line.trim_matches(|c| c == '"' || c == '“' || c == '”' || c == '`');
    if line.trim() == NOTHING {
        return None;
    }
    let typed = current_line(before);
    let reply = if strip_marker(typed) == typed.trim_start() {
        strip_marker(line)
    } else {
        line.trim_start()
    };
    let typed = typed.trim_start();
    let rest = match reply.strip_prefix(typed) {
        Some(rest) => rest,
        None => {
            let prefix = head(reply, typed.chars().count());
            if prefix.to_lowercase() != typed.to_lowercase() {
                return None;
            }
            &reply[prefix.len()..]
        }
    };
    let rest = if typed.is_empty() || typed.ends_with(char::is_whitespace) {
        rest.trim_start()
    } else {
        rest
    };
    let rest = rest.trim_end();
    if rest.trim().is_empty() {
        return None;
    }
    if rest.chars().count() <= MAX_SUGGESTION_CHARS {
        return Some(rest.to_string());
    }
    Some(crate::ops::truncate_at_word_boundary(
        rest,
        MAX_SUGGESTION_CHARS,
        "",
    ))
}

/// A suggestion for what comes next at the cursor in a meeting's notes, or
/// None when the model has nothing to add. `before` and `after` are the
/// notes' text either side of the cursor, one line per block.
pub async fn suggest(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    before: &str,
    after: &str,
    provider: &str,
    model: &str,
) -> Result<Option<String>> {
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
    Ok(continuation(&reply, before))
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

    #[test]
    fn continues_the_typed_line() {
        let before = "Launch\nShip date";
        assert_eq!(
            continuation("Ship date moves to March 14 (Priya)", before).as_deref(),
            Some(" moves to March 14 (Priya)")
        );
    }

    #[test]
    fn finishes_a_word_in_progress() {
        assert_eq!(
            continuation("Budget approved at $40k", "Budget approv").as_deref(),
            Some("ed at $40k")
        );
    }

    #[test]
    fn drops_the_space_already_typed() {
        assert_eq!(
            continuation("Owner: Sam", "Owner: ").as_deref(),
            Some("Sam")
        );
    }

    #[test]
    fn writes_a_new_note_on_an_empty_line() {
        assert_eq!(
            continuation("- Follow up with legal by Friday", "Notes\n").as_deref(),
            Some("Follow up with legal by Friday")
        );
    }

    #[test]
    fn ignores_case_differences_in_the_echo() {
        assert_eq!(
            continuation("pricing: tiered, three plans", "Pricing:").as_deref(),
            Some(" tiered, three plans")
        );
    }

    #[test]
    fn rejects_a_rewrite() {
        assert_eq!(continuation("Ship date is Friday", "Launch date"), None);
    }

    #[test]
    fn nothing_to_add() {
        assert_eq!(continuation("NONE", "Ship date"), None);
        assert_eq!(continuation("Ship date", "Ship date"), None);
        assert_eq!(continuation("", "Ship date"), None);
    }

    #[test]
    fn unwraps_fences_and_quotes() {
        assert_eq!(
            continuation("```\n\"Risks: vendor delay\"\n```", "Risks:").as_deref(),
            Some(" vendor delay")
        );
    }

    #[test]
    fn caps_long_suggestions_at_a_word() {
        let reply = format!("Notes {}", "word ".repeat(100));
        let rest = continuation(&reply, "Notes").unwrap();
        assert!(rest.chars().count() <= MAX_SUGGESTION_CHARS);
        assert!(rest.ends_with("word"));
    }

    #[test]
    fn keeps_the_marker_the_user_typed() {
        assert_eq!(
            continuation("1. Hire two engineers", "1. Hire").as_deref(),
            Some(" two engineers")
        );
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
            "Ship date",
            "\nRisks",
            "[00:00] Priya: Friday.",
        );
        assert!(p.contains("Ship date⟨CURSOR⟩\nRisks"));
        assert!(p.contains("Launch sync"));
    }
}
