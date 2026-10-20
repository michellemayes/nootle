//! Turns a meeting into files people can take elsewhere: a Markdown write-up,
//! a plain-text transcript, or SRT / WebVTT subtitles for the recording.

use crate::db::{
    Database, InsightWithActionItem, Meeting, MeetingAnnotation, Summary, TranscriptSegment,
};
use crate::error::{NootleError, Result};
use crate::slides::Slide;
use crate::summarization::{format_ms, format_transcript};
use std::fmt::Write;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Markdown,
    Text,
    Srt,
    Vtt,
}

impl ExportFormat {
    pub const ALL: &'static [&'static str] = &["md", "txt", "srt", "vtt"];

    pub fn parse(s: &str) -> Result<Self> {
        match s.to_ascii_lowercase().as_str() {
            "md" | "markdown" => Ok(Self::Markdown),
            "txt" | "text" => Ok(Self::Text),
            "srt" => Ok(Self::Srt),
            "vtt" | "webvtt" => Ok(Self::Vtt),
            other => Err(NootleError::Other(format!(
                "Unknown export format '{other}'. Use one of: {}",
                Self::ALL.join(", ")
            ))),
        }
    }
}

/// How a Markdown export shows slide pictures.
#[derive(Debug, Clone, Copy)]
pub enum SlideImages<'a> {
    /// Text only, with a note saying so: the Markdown travels on its own.
    Omitted,
    /// Copied into this folder beside the .md file, and linked from it.
    Folder(&'a str),
}

/// Render one meeting in `format`, reading whatever that format needs.
/// Markdown rendered this way has no slide pictures; `write_meeting` adds them.
pub fn export_meeting(db: &Database, meeting_id: &str, format: ExportFormat) -> Result<String> {
    Ok(match format {
        ExportFormat::Text => format_transcript(&db.get_transcript(meeting_id)?) + "\n",
        ExportFormat::Srt => to_srt(&db.get_transcript(meeting_id)?),
        ExportFormat::Vtt => to_vtt(&db.get_transcript(meeting_id)?),
        ExportFormat::Markdown => full_markdown(db, meeting_id, true, true)?,
    })
}

/// Writes one meeting to `path` in `format`. A Markdown file's slide pictures
/// are copied into a `<name> slides` folder beside it.
pub fn write_meeting(
    db: &Database,
    meeting_id: &str,
    format: ExportFormat,
    path: &Path,
) -> Result<()> {
    if format != ExportFormat::Markdown {
        std::fs::write(path, export_meeting(db, meeting_id, format)?)?;
        return Ok(());
    }
    let meeting = db.get_meeting(meeting_id)?;
    let segments = db.get_transcript(meeting_id)?;
    write_markdown(db, &meeting, &db.list_templates()?, &segments, path)
}

fn write_markdown(
    db: &Database,
    meeting: &Meeting,
    templates: &[crate::db::Template],
    segments: &[TranscriptSegment],
    path: &Path,
) -> Result<()> {
    let stem = path
        .file_stem()
        .map_or_else(|| "meeting".into(), |s| s.to_string_lossy());
    let folder = format!("{stem} slides");
    let slides = crate::slides::aligned(db, &meeting.id, segments)?;
    if !slides.is_empty() {
        let dir = path.with_file_name(&folder);
        std::fs::create_dir_all(&dir)?;
        for slide in &slides {
            if let Err(e) = std::fs::copy(&slide.snapshot.image_path, dir.join(image_name(slide))) {
                tracing::warn!("Couldn't copy slide {} for export: {e}", slide.number);
            }
        }
    }
    let content = meeting_markdown(
        db,
        meeting,
        templates,
        segments,
        &slides,
        SlideImages::Folder(&folder),
        true,
    )?;
    std::fs::write(path, content)?;
    Ok(())
}

/// `slide-04.jpg`: what a slide's picture is called in an export folder.
fn image_name(slide: &Slide) -> String {
    let ext = Path::new(&slide.snapshot.image_path)
        .extension()
        .map_or_else(|| "jpg".into(), |e| e.to_string_lossy());
    format!("slide-{:02}.{ext}", slide.number)
}

/// One meeting as Markdown to hand to someone else (a share link, a Claude
/// prompt): the notes, summaries, and action items, and the transcript if
/// asked. Agents' annotations are the user's own and stay out.
pub fn meeting_as_markdown(
    db: &Database,
    meeting_id: &str,
    include_transcript: bool,
) -> Result<String> {
    full_markdown(db, meeting_id, include_transcript, false)
}

fn full_markdown(
    db: &Database,
    meeting_id: &str,
    include_transcript: bool,
    include_annotations: bool,
) -> Result<String> {
    let meeting = db.get_meeting(meeting_id)?;
    let segments = if include_transcript {
        db.get_transcript(meeting_id)?
    } else {
        Vec::new()
    };
    let slides = crate::slides::for_meeting(db, meeting_id)?;
    meeting_markdown(
        db,
        &meeting,
        &db.list_templates()?,
        &segments,
        &slides,
        SlideImages::Omitted,
        include_annotations,
    )
}

/// A meeting as Markdown, naming each summary after its template.
fn meeting_markdown(
    db: &Database,
    meeting: &Meeting,
    templates: &[crate::db::Template],
    segments: &[TranscriptSegment],
    slides: &[Slide],
    images: SlideImages,
    include_annotations: bool,
) -> Result<String> {
    let summaries: Vec<(String, Summary)> = db
        .get_summaries_for_meeting(&meeting.id)?
        .into_iter()
        .map(|s| {
            let name = s
                .template_id
                .as_ref()
                .and_then(|id| templates.iter().find(|t| &t.id == id))
                .map_or_else(|| "Summary".to_string(), |t| t.name.clone());
            (name, s)
        })
        .collect();
    let insights = db.get_insights_for_meeting(&meeting.id)?;
    let annotations = if include_annotations {
        db.get_meeting_annotations(&meeting.id)?
    } else {
        Vec::new()
    };
    Ok(to_markdown(
        meeting,
        &summaries,
        slides,
        images,
        &insights,
        &annotations,
        segments,
    ))
}

/// Writes every meeting (archived ones too) into `dir` as Markdown, one
/// `YYYY-MM-DD Title.md` file each, so your notes are plain files you own.
/// Returns how many were written.
pub fn export_all_markdown(db: &Database, dir: &std::path::Path) -> Result<usize> {
    std::fs::create_dir_all(dir)?;
    let meetings = db.list_meetings(None, true, None)?;
    let templates = db.list_templates()?;
    let mut used = std::collections::HashSet::new();
    for meeting in &meetings {
        let segments = db.get_transcript(&meeting.id)?;
        let base = file_name_for(meeting);
        let mut name = format!("{base}.md");
        let mut n = 2;
        while !used.insert(name.clone()) {
            name = format!("{base} ({n}).md");
            n += 1;
        }
        write_markdown(db, meeting, &templates, &segments, &dir.join(name))?;
    }
    Ok(meetings.len())
}

/// `2026-10-11 Weekly sync`, without characters file systems reject.
fn file_name_for(meeting: &Meeting) -> String {
    let date = meeting.start_time.get(..10).unwrap_or("");
    crate::workflows::sanitize_filename(&format!("{date} {}", meeting.title))
}

pub fn to_srt(segments: &[TranscriptSegment]) -> String {
    let mut out = String::new();
    for (i, s) in segments.iter().enumerate() {
        let (start, end) = cue_bounds(s);
        let _ = writeln!(
            out,
            "{}\n{} --> {}\n{}: {}\n",
            i + 1,
            cue_time(start, ','),
            cue_time(end, ','),
            s.speaker_label,
            s.text.trim()
        );
    }
    out
}

pub fn to_vtt(segments: &[TranscriptSegment]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for s in segments {
        let (start, end) = cue_bounds(s);
        let _ = writeln!(
            out,
            "{} --> {}\n<v {}>{}\n",
            cue_time(start, '.'),
            cue_time(end, '.'),
            s.speaker_label,
            s.text.trim()
        );
    }
    out
}

pub fn to_markdown(
    meeting: &Meeting,
    summaries: &[(String, Summary)],
    slides: &[Slide],
    images: SlideImages,
    insights: &[InsightWithActionItem],
    annotations: &[MeetingAnnotation],
    segments: &[TranscriptSegment],
) -> String {
    let mut out = format!("# {}\n\n", meeting.title);
    let _ = writeln!(out, "{}\n", meeting_when(meeting));

    for (name, summary) in summaries {
        let _ = writeln!(out, "## {name}\n\n{}\n", summary.content.trim());
    }

    if !slides.is_empty() {
        out.push_str("## Slide recap\n\n");
        if let SlideImages::Omitted = images {
            out.push_str(
                "_Slide pictures aren't included here; they're with the meeting in Nootle._\n\n",
            );
        }
        for slide in slides {
            let _ = write!(out, "### Slide {}", slide.number);
            if !slide.headline.is_empty() {
                let _ = write!(out, " · {}", slide.headline);
            }
            let _ = writeln!(
                out,
                " ({}–{})\n",
                format_ms(slide.snapshot.offset_ms),
                format_ms(slide.end_ms)
            );
            if let SlideImages::Folder(folder) = images {
                let _ = writeln!(
                    out,
                    "![Slide {}](<{folder}/{}>)\n",
                    slide.number,
                    image_name(slide)
                );
            }
            if let Some(recap) = slide.snapshot.recap.as_deref() {
                let _ = writeln!(out, "{}\n", recap.trim());
            }
        }
    }

    let action_items: Vec<_> = insights
        .iter()
        .filter(|i| i.action_item_id.is_some())
        .collect();
    if !action_items.is_empty() {
        out.push_str("## Action items\n\n");
        for item in action_items {
            let done = item.status.as_deref() == Some("done");
            let mut details = Vec::new();
            if let Some(who) = item.assignee.as_deref().filter(|s| !s.is_empty()) {
                details.push(who.to_string());
            }
            if let Some(due) = item.due_date.as_deref().filter(|s| !s.is_empty()) {
                details.push(format!("due {due}"));
            }
            let suffix = if details.is_empty() {
                String::new()
            } else {
                format!(" ({})", details.join(", "))
            };
            let _ = writeln!(
                out,
                "- [{}] {}{suffix}",
                if done { "x" } else { " " },
                item.content.trim()
            );
        }
        out.push('\n');
    }

    // An empty enriched note must not hide the raw notes it was built from.
    let notes = [&meeting.enriched_notes, &meeting.raw_notes]
        .into_iter()
        .filter_map(|n| n.as_deref().map(str::trim))
        .find(|n| !n.is_empty());
    if let Some(notes) = notes {
        let _ = writeln!(out, "## Notes\n\n{notes}\n");
    }

    if !annotations.is_empty() {
        out.push_str("## Agent notes\n\n");
        write_annotations(&mut out, annotations);
        out.push('\n');
    }

    if !segments.is_empty() {
        out.push_str("## Transcript\n\n");
        for s in segments {
            let _ = writeln!(
                out,
                "**[{}] {}:** {}\n",
                format_ms(s.start_ms),
                s.speaker_label,
                s.text.trim()
            );
        }
    }

    out.trim_end().to_string() + "\n"
}

/// Agents' annotations as a Markdown list, one item each.
fn write_annotations(out: &mut String, annotations: &[MeetingAnnotation]) {
    for a in annotations {
        let mut when = format_ms(a.start_ms);
        if let Some(end) = a.end_ms {
            let _ = write!(when, "–{}", format_ms(end));
        }
        let resolved = if a.resolved_at.is_some() {
            ", resolved"
        } else {
            ""
        };
        // Indent the body's later lines so they stay in its list item.
        let body = a.body.trim().replace('\n', "\n  ");
        let _ = writeln!(
            out,
            "- **[{when}] {}** ({}{resolved}): {body}",
            a.kind.label(),
            a.author
        );
    }
}

fn meeting_when(meeting: &Meeting) -> String {
    let Ok(start) = chrono::DateTime::parse_from_rfc3339(&meeting.start_time) else {
        return meeting.start_time.clone();
    };
    let local = start.with_timezone(&chrono::Local);
    let mut when = local.format("%A, %B %-d, %Y at %-I:%M %p").to_string();
    let minutes = meeting
        .end_time
        .as_deref()
        .and_then(|e| chrono::DateTime::parse_from_rfc3339(e).ok())
        .map(|end| (end - start).num_minutes());
    if let Some(m) = minutes.filter(|m| *m > 0) {
        let _ = write!(when, " · {m} min");
    }
    when
}

/// Subtitle players drop zero-length cues, so give each one at least a second.
fn cue_bounds(s: &TranscriptSegment) -> (i64, i64) {
    let start = s.start_ms.max(0);
    (start, s.end_ms.max(start + 1000))
}

/// `HH:MM:SS<sep>mmm`, the cue timestamp both SRT (`,`) and VTT (`.`) use.
fn cue_time(ms: i64, sep: char) -> String {
    let ms = ms.max(0);
    let secs = ms / 1000;
    format!(
        "{:02}:{:02}:{:02}{sep}{:03}",
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60,
        ms % 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_every_meeting_as_a_markdown_file() {
        let db = Database::new_in_memory().unwrap();
        for title in ["Weekly sync", "Weekly sync", "Q3: plan/review"] {
            db.create_meeting(crate::db::NewMeeting {
                title: title.into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        }
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(export_all_markdown(&db, dir.path()).unwrap(), 3);
        let mut names: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy()[11..].to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            ["Q3_ plan_review.md", "Weekly sync (2).md", "Weekly sync.md"]
        );
    }

    fn seg(speaker: &str, text: &str, start_ms: i64, end_ms: i64) -> TranscriptSegment {
        TranscriptSegment {
            id: "s".into(),
            meeting_id: "m".into(),
            speaker_label: speaker.into(),
            text: text.into(),
            start_ms,
            end_ms,
            confidence: 0.9,
        }
    }

    fn segments() -> Vec<TranscriptSegment> {
        vec![
            seg("Alex", "Morning all.", 0, 1_500),
            seg("Sam", " Let's ship it. ", 3_661_250, 3_661_250),
        ]
    }

    #[test]
    fn parses_formats() {
        assert_eq!(ExportFormat::parse("MD").unwrap(), ExportFormat::Markdown);
        assert_eq!(ExportFormat::parse("webvtt").unwrap(), ExportFormat::Vtt);
        let err = ExportFormat::parse("pdf").unwrap_err().to_string();
        assert!(err.contains("md, txt, srt, vtt"), "{err}");
    }

    #[test]
    fn timestamps_gain_hours_past_the_hour() {
        assert_eq!(format_ms(61_000), "01:01");
        assert_eq!(format_ms(3_661_250), "1:01:01");
    }

    #[test]
    fn srt_numbers_cues_and_pads_empty_ones() {
        let srt = to_srt(&segments());
        assert!(srt.starts_with("1\n00:00:00,000 --> 00:00:01,500\nAlex: Morning all.\n\n"));
        assert!(srt.contains("2\n01:01:01,250 --> 01:01:02,250\nSam: Let's ship it.\n"));
    }

    #[test]
    fn vtt_uses_voice_tags() {
        let vtt = to_vtt(&segments());
        assert!(vtt.starts_with("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\n<v Alex>Morning all.\n"));
    }

    #[test]
    fn markdown_includes_every_section() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Launch sync".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        db.update_meeting_notes(&meeting.id, "Remember the changelog")
            .unwrap();
        for s in segments() {
            db.create_transcript_segment(crate::db::NewTranscriptSegment {
                meeting_id: meeting.id.clone(),
                speaker_label: s.speaker_label,
                text: s.text,
                start_ms: s.start_ms,
                end_ms: s.end_ms,
                confidence: s.confidence,
            })
            .unwrap();
        }
        db.create_summary(crate::db::NewSummary {
            meeting_id: meeting.id.clone(),
            template_id: None,
            provider: "ollama".into(),
            model: "m".into(),
            content: "We agreed to ship.".into(),
        })
        .unwrap();

        let flag = db
            .add_meeting_annotation(crate::db::NewMeetingAnnotation {
                meeting_id: meeting.id.clone(),
                start_ms: 0,
                end_ms: Some(1_500),
                kind: crate::db::AnnotationKind::Flag,
                body: "Contradicts ADR-12.\nSee the doc.".into(),
                author: "claude-code".into(),
            })
            .unwrap();
        db.set_meeting_annotation_resolved(&flag.id, true).unwrap();

        let md = export_meeting(&db, &meeting.id, ExportFormat::Markdown).unwrap();
        assert!(md.starts_with("# Launch sync\n\n"), "{md}");
        assert!(
            md.contains("## Agent notes\n\n- **[00:00–00:01] Flag** (claude-code, resolved): Contradicts ADR-12.\n  See the doc.\n\n## Transcript"),
            "{md}"
        );
        // Shared notes leave them out.
        assert!(!meeting_as_markdown(&db, &meeting.id, true)
            .unwrap()
            .contains("Agent notes"));
        assert!(md.contains("## Summary\n\nWe agreed to ship.\n"), "{md}");
        assert!(md.contains("## Notes\n\nRemember the changelog\n"), "{md}");
        assert!(md.contains("**[00:00] Alex:** Morning all.\n"), "{md}");
    }

    #[test]
    fn markdown_files_bring_their_slide_pictures() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Deck review".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("snap.jpg");
        std::fs::write(&image, b"jpeg").unwrap();
        let snap = db
            .create_snapshot(
                &meeting.id,
                &image.to_string_lossy(),
                "Q3 revenue\n$4.2M",
                65_000,
            )
            .unwrap();
        db.set_snapshot_recap(&snap.id, "Sam doubted the forecast.")
            .unwrap();

        let path = dir.path().join("out").join("Review.md");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        write_meeting(&db, &meeting.id, ExportFormat::Markdown, &path).unwrap();
        let md = std::fs::read_to_string(&path).unwrap();
        assert!(
            md.contains(
                "## Slide recap\n\n### Slide 1 · Q3 revenue (01:05–01:05)\n\n\
                 ![Slide 1](<Review slides/slide-01.jpg>)\n\nSam doubted the forecast.\n"
            ),
            "{md}"
        );
        let copied = dir.path().join("out/Review slides/slide-01.jpg");
        assert_eq!(std::fs::read(copied).unwrap(), b"jpeg");

        // Shared or returned as text, there are no pictures to link.
        let shared = meeting_as_markdown(&db, &meeting.id, false).unwrap();
        assert!(
            shared.contains("Slide pictures aren't included"),
            "{shared}"
        );
        assert!(shared.contains("Sam doubted the forecast."), "{shared}");
        assert!(!shared.contains("!["), "{shared}");
    }

    #[test]
    fn meetings_without_slides_export_as_before() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Chat".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Chat.md");
        write_meeting(&db, &meeting.id, ExportFormat::Markdown, &path).unwrap();
        assert!(!std::fs::read_to_string(&path).unwrap().contains("Slide"));
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn markdown_lists_action_items_as_checkboxes() {
        let item = |content: &str, status: &str, assignee: Option<&str>| InsightWithActionItem {
            id: "i".into(),
            meeting_id: "m".into(),
            insight_type: "action_item".into(),
            content: content.into(),
            context: None,
            transcript_start_ms: None,
            transcript_end_ms: None,
            created_at: String::new(),
            action_item_id: Some("a".into()),
            assignee: assignee.map(Into::into),
            due_date: None,
            status: Some(status.into()),
            linear_ticket_id: None,
            action_item_updated_at: None,
            meeting_title: None,
            meeting_start_time: None,
        };
        let meeting = Meeting {
            id: "m".into(),
            title: "T".into(),
            start_time: "not a date".into(),
            end_time: None,
            audio_path: None,
            status: "summarized".into(),
            calendar_event_id: None,
            raw_notes: None,
            enriched_notes: None,
            template_id: None,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let md = to_markdown(
            &meeting,
            &[],
            &[],
            SlideImages::Omitted,
            &[
                item("Write the post", "open", Some("Sam")),
                item("Book the room", "done", None),
            ],
            &[],
            &[],
        );
        assert!(
            md.contains("- [ ] Write the post (Sam)\n- [x] Book the room\n"),
            "{md}"
        );
        assert!(!md.contains("## Transcript"));
    }
}
