//! Slide-aware summaries: ties each snapshot of a shared screen (see
//! `snapshots`) to what was said while it was up.
//!
//! A snapshot is taken when the shared content changes, so each one stays on
//! screen from its capture until the next one (or, for the last, until the
//! meeting ends). Summaries get a compact list of the slides with those
//! windows and cite them as `[slide N]`, and each slide gets a short recap of
//! the discussion while it was showing.

use crate::db::{Database, Snapshot, TranscriptSegment};
use crate::llm::{ChatMessage, LlmRegistry};
use crate::ops::truncate_at_word_boundary;
use crate::summarization::{format_ms, format_transcript};
use serde::Serialize;

/// Longest a slide is taken to be on screen. Snapshots don't record when a
/// share ends, so without this the last slide would claim the rest of the
/// meeting.
const MAX_WINDOW_MS: i64 = 10 * 60_000;
/// Characters of slide text, across all slides, in a summary prompt, so a
/// long deck doesn't crowd out the transcript.
const PROMPT_TEXT_BUDGET: usize = 12_000;
/// Most text from one slide in a prompt.
const SLIDE_TEXT_MAX: usize = 400;
/// Most of what was said under one slide that goes into a recap prompt.
const EXCERPT_MAX: usize = 3_000;
/// Slides recapped per LLM call, which keeps each prompt small enough for a
/// local model's context window.
const RECAP_BATCH: usize = 8;
/// Stored for a slide nobody spoke over, so it isn't offered again.
const NOTHING_SAID: &str = "Nothing was said while this was on screen.";

/// A snapshot with its place in the deck and the stretch of the meeting it
/// was on screen for: from its `offset_ms` to `end_ms`.
#[derive(Debug, Clone, Serialize)]
pub struct Slide {
    /// 1-based, in meeting order: what summaries cite as `[slide N]`.
    pub number: usize,
    pub end_ms: i64,
    /// The first meaningful line of text read off it.
    pub headline: String,
    #[serde(flatten)]
    pub snapshot: Snapshot,
}

/// Numbers snapshots in meeting order and gives each the window it was on
/// screen: until the next snapshot or `meeting_end_ms`, at most
/// `MAX_WINDOW_MS`.
pub fn align(mut snapshots: Vec<Snapshot>, meeting_end_ms: i64) -> Vec<Slide> {
    snapshots.sort_by_key(|s| s.offset_ms);
    let next_starts: Vec<i64> = snapshots
        .iter()
        .skip(1)
        .map(|s| s.offset_ms)
        .chain([meeting_end_ms])
        .collect();
    snapshots
        .into_iter()
        .zip(next_starts)
        .enumerate()
        .map(|(i, (snapshot, next))| {
            let start_ms = snapshot.offset_ms;
            Slide {
                number: i + 1,
                end_ms: next.min(start_ms + MAX_WINDOW_MS).max(start_ms),
                headline: headline(&snapshot.text),
                snapshot,
            }
        })
        .collect()
}

/// A meeting's slides, aligned to `segments`, its transcript.
pub fn aligned(
    db: &Database,
    meeting_id: &str,
    segments: &[TranscriptSegment],
) -> anyhow::Result<Vec<Slide>> {
    let end_ms = segments.iter().map(|s| s.end_ms).max().unwrap_or(0);
    Ok(align(db.get_snapshots(meeting_id)?, end_ms))
}

/// A meeting's slides, aligned to its transcript. Empty without snapshots.
pub fn for_meeting(db: &Database, meeting_id: &str) -> anyhow::Result<Vec<Slide>> {
    aligned(db, meeting_id, &db.get_transcript(meeting_id)?)
}

/// What was said while `slide` was on screen, from `segments` in time order.
pub fn said_during<'a>(
    slide: &Slide,
    segments: &'a [TranscriptSegment],
) -> &'a [TranscriptSegment] {
    let from = segments.partition_point(|s| s.start_ms < slide.snapshot.offset_ms);
    let to = segments
        .partition_point(|s| s.start_ms < slide.end_ms)
        .max(from);
    &segments[from..to]
}

/// The first line that reads like a title (two words or more), else the
/// first line with text.
fn headline(text: &str) -> String {
    let lines = || text.lines().map(str::trim).filter(|l| !l.is_empty());
    let line = lines()
        .find(|l| l.split_whitespace().count() >= 2)
        .or_else(|| lines().next())
        .unwrap_or("");
    truncate_at_word_boundary(line, 60, "…")
}

/// Slide text on one line, cut to `max_chars`.
fn flat_text(text: &str, max_chars: usize) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    truncate_at_word_boundary(&flat, max_chars, "…")
}

fn window(slide: &Slide) -> String {
    format!(
        "{}–{}",
        format_ms(slide.snapshot.offset_ms),
        format_ms(slide.end_ms)
    )
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/// Added to a summary template's instructions when the meeting has slides.
pub const CITE_INSTRUCTIONS: &str = "\n\nSlides were shared on screen during this meeting; \
    they're listed after the transcript with when each was up. When a point was made while a \
    slide was showing, or is about one, cite it inline as [slide N], for example: \"While \
    slide 4 (Q3 revenue) was up, the team pushed back on the forecast [slide 4].\" Use only \
    numbers from the list, one slide per bracket, and don't cite a slide for every sentence.";

/// The slides as an LLM reads them after the transcript (summaries, chat,
/// recipes): number, window, and text, with the text shortened so the whole
/// list stays within `PROMPT_TEXT_BUDGET`. Empty without slides.
pub fn prompt_section(slides: &[Slide]) -> String {
    if slides.is_empty() {
        return String::new();
    }
    let per_slide = (PROMPT_TEXT_BUDGET / slides.len()).min(SLIDE_TEXT_MAX);
    let lines: Vec<String> = slides
        .iter()
        .map(|s| {
            let text = flat_text(&s.snapshot.text, per_slide);
            let text = if text.is_empty() {
                "(no readable text)".to_string()
            } else {
                text
            };
            format!("Slide {} ({}): {text}", s.number, window(s))
        })
        .collect();
    format!(
        "\n\nSlides shared on screen, with when each was up (text read off them may include \
         some of the meeting app's own interface):\n{}",
        lines.join("\n")
    )
}

// ---------------------------------------------------------------------------
// Slide recap
// ---------------------------------------------------------------------------

/// Writes a short recap of what was said while each slide was on screen and
/// saves it with the slide. Slides that already have one are left alone
/// unless `replace`. Returns the meeting's slides.
pub async fn generate_recaps(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
    replace: bool,
) -> anyhow::Result<Vec<Slide>> {
    let segments = db.get_transcript(meeting_id)?;
    let mut slides = aligned(db, meeting_id, &segments)?;
    let mut spoken = Vec::new();
    for (i, slide) in slides.iter_mut().enumerate() {
        if !replace && slide.snapshot.recap.is_some() {
            continue;
        }
        let said = said_during(slide, &segments);
        if said.is_empty() {
            db.set_snapshot_recap(&slide.snapshot.id, NOTHING_SAID)?;
            slide.snapshot.recap = Some(NOTHING_SAID.into());
        } else {
            spoken.push((i, said));
        }
    }
    if spoken.is_empty() {
        return Ok(slides);
    }
    let provider = llm
        .get_provider(provider_name)
        .ok_or_else(|| anyhow::anyhow!("Provider '{}' not found", provider_name))?;
    for batch in spoken.chunks(RECAP_BATCH) {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "You recap a meeting slide by slide. For each slide, write 1 to 3 \
                          plain sentences on what was said while it was on screen: the \
                          points made, questions, pushback, and decisions, naming who said \
                          them. Don't describe the slide itself. Reply with one line per \
                          slide, exactly in the form `N: recap`, and nothing else."
                    .into(),
            },
            ChatMessage {
                role: "user".into(),
                content: recap_prompt(&slides, batch),
            },
        ];
        let reply = provider.chat(messages, model).await?;
        for (number, recap) in parse_recaps(&reply) {
            if let Some(&(i, _)) = batch.iter().find(|(i, _)| slides[*i].number == number) {
                db.set_snapshot_recap(&slides[i].snapshot.id, &recap)?;
                slides[i].snapshot.recap = Some(recap);
            }
        }
    }
    Ok(slides)
}

/// Each slide in `batch` (an index into `slides` with what was said under
/// it) as a recap prompt reads it.
fn recap_prompt(slides: &[Slide], batch: &[(usize, &[TranscriptSegment])]) -> String {
    batch
        .iter()
        .map(|&(i, said)| {
            let slide = &slides[i];
            format!(
                "Slide {} ({})\nOn screen: {}\nSaid while it was up:\n{}",
                slide.number,
                window(slide),
                flat_text(&slide.snapshot.text, SLIDE_TEXT_MAX),
                truncate_at_word_boundary(&format_transcript(said), EXCERPT_MAX, " …"),
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Reads `N: recap` lines (also `Slide N: …`, `N. …`, `- N) …`), ignoring
/// anything else the model adds.
fn parse_recaps(reply: &str) -> Vec<(usize, String)> {
    reply
        .lines()
        .filter_map(|line| {
            let line = line
                .trim()
                .trim_start_matches(['-', '*', ' '])
                .trim_start_matches("**");
            let rest = line
                .strip_prefix("Slide ")
                .or_else(|| line.strip_prefix("slide "))
                .unwrap_or(line);
            let digits = rest.find(|c: char| !c.is_ascii_digit())?;
            let number = rest[..digits].parse().ok()?;
            let recap = rest[digits..]
                .trim_start_matches(['*', ':', '.', ')', '-', '–', ' '])
                .trim();
            (!recap.is_empty()).then(|| (number, recap.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(id: &str, text: &str, offset_ms: i64) -> Snapshot {
        Snapshot {
            id: id.into(),
            meeting_id: "m".into(),
            image_path: format!("/s/{id}.jpg"),
            text: text.into(),
            offset_ms,
            created_at: String::new(),
            recap: None,
        }
    }

    fn seg(text: &str, start_ms: i64) -> TranscriptSegment {
        TranscriptSegment {
            id: text.into(),
            meeting_id: "m".into(),
            speaker_label: "Sam".into(),
            text: text.into(),
            start_ms,
            end_ms: start_ms + 2_000,
            confidence: 1.0,
        }
    }

    #[test]
    fn each_slide_is_up_until_the_next_one() {
        let slides = align(
            vec![snap("b", "Roadmap", 60_000), snap("a", "Revenue", 5_000)],
            90_000,
        );
        let windows: Vec<_> = slides
            .iter()
            .map(|s| {
                (
                    s.number,
                    s.snapshot.id.as_str(),
                    s.snapshot.offset_ms,
                    s.end_ms,
                )
            })
            .collect();
        assert_eq!(windows, [(1, "a", 5_000, 60_000), (2, "b", 60_000, 90_000)]);
    }

    #[test]
    fn the_last_slide_doesnt_claim_the_rest_of_a_long_meeting() {
        let slides = align(vec![snap("a", "Intro", 0)], 60 * 60_000);
        assert_eq!(slides[0].end_ms, MAX_WINDOW_MS);
        // A snapshot taken after the transcript ends gets an empty window.
        let slides = align(vec![snap("a", "Thanks", 50_000)], 40_000);
        assert_eq!(slides[0].end_ms, 50_000);
    }

    #[test]
    fn speech_goes_to_the_slide_on_screen() {
        let slides = align(vec![snap("a", "", 10_000), snap("b", "", 20_000)], 30_000);
        let segments = [
            seg("before", 0),
            seg("first", 10_000),
            seg("still first", 19_999),
            seg("second", 20_000),
        ];
        let said = |i: usize| -> Vec<&str> {
            said_during(&slides[i], &segments)
                .iter()
                .map(|s| s.text.as_str())
                .collect()
        };
        assert_eq!(said(0), ["first", "still first"]);
        assert_eq!(said(1), ["second"]);
    }

    #[test]
    fn headline_skips_lone_words() {
        assert_eq!(headline("Zoom\n  Q3 revenue  \nUp 12%"), "Q3 revenue");
        assert_eq!(headline("\nAgenda\n"), "Agenda");
        assert_eq!(headline(""), "");
    }

    #[test]
    fn prompt_lists_slides_with_windows_and_bounded_text() {
        assert_eq!(prompt_section(&[]), "");
        let slides = align(
            vec![
                snap("a", "Q3 revenue\n$4.2M", 65_000),
                snap("b", " ", 125_000),
            ],
            185_000,
        );
        let section = prompt_section(&slides);
        assert!(
            section.contains("Slide 1 (01:05–02:05): Q3 revenue $4.2M\n"),
            "{section}"
        );
        assert!(
            section.ends_with("Slide 2 (02:05–03:05): (no readable text)"),
            "{section}"
        );

        let long = "word ".repeat(10_000);
        let deck: Vec<_> = (0..100)
            .map(|i| snap(&i.to_string(), &long, i * 1_000))
            .collect();
        let section = prompt_section(&align(deck, 100_000));
        assert!(
            section.len() < PROMPT_TEXT_BUDGET + 100 * 40,
            "{}",
            section.len()
        );
    }

    #[test]
    fn recap_prompt_holds_only_what_was_said_under_each_slide() {
        let slides = align(
            vec![snap("a", "Pricing", 0), snap("b", "Hiring", 10_000)],
            20_000,
        );
        let segments = [seg("Too cheap?", 1_000), seg("Two engineers.", 11_000)];
        let prompt = recap_prompt(&slides, &[(1, said_during(&slides[1], &segments))]);
        assert!(
            prompt.starts_with("Slide 2 (00:10–00:20)\nOn screen: Hiring\n"),
            "{prompt}"
        );
        assert!(prompt.contains("Sam: Two engineers."), "{prompt}");
        assert!(!prompt.contains("Too cheap"), "{prompt}");
    }

    #[test]
    fn parses_recap_lines_in_the_shapes_models_write() {
        let reply = "Here you go:\n1: Sam said it's too cheap.\n**Slide 2:** Priya wants two \
                     engineers.\n- 3) Nobody objected.\n4:\nslide 5 – Agreed.";
        assert_eq!(
            parse_recaps(reply),
            [
                (1, "Sam said it's too cheap.".to_string()),
                (2, "Priya wants two engineers.".to_string()),
                (3, "Nobody objected.".to_string()),
                (5, "Agreed.".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn recaps_are_saved_and_silent_slides_skip_the_llm() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Review".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        db.create_snapshot(&meeting.id, "/s/1.jpg", "Title slide", 0)
            .unwrap();
        // No LLM is registered: a meeting whose slides nobody spoke over
        // still gets recaps, and asking again is a no-op.
        let llm = LlmRegistry::new();
        let slides = generate_recaps(&db, &llm, &meeting.id, "ollama", "m", false)
            .await
            .unwrap();
        assert_eq!(slides[0].snapshot.recap.as_deref(), Some(NOTHING_SAID));
        db.create_transcript_segment(crate::db::NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: "Sam".into(),
            text: "Welcome.".into(),
            start_ms: 500,
            end_ms: 1_500,
            confidence: 1.0,
        })
        .unwrap();
        assert!(
            generate_recaps(&db, &llm, &meeting.id, "ollama", "m", false)
                .await
                .is_ok()
        );
        // Redoing it needs the model, and says so when there isn't one.
        let err = generate_recaps(&db, &llm, &meeting.id, "ollama", "m", true)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("not found"), "{err}");
    }
}
