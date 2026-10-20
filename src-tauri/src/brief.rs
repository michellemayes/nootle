//! Pre-meeting brief: a one-screen look at a calendar event before it
//! starts, assembled from what Nootle already has. Who's coming (and when
//! you last met them), open action items, what the series decided last
//! time, and the knowledge-base documents most related to the event, with
//! an optional few sentences from the AI on what to cover.

use std::collections::HashSet;

use crate::calendar::CalendarEvent;
use crate::db::{Database, KnowledgeHit, Person};
use crate::llm::{ChatMessage, LlmRegistry};
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

/// Shows a brief before each calendar meeting. Off unless turned on.
pub const SETTING_KEY: &str = "pre_meeting_brief";
/// How many minutes before the meeting the brief appears.
pub const LEAD_SETTING: &str = "pre_meeting_brief_lead_minutes";
pub const LEAD_CHOICES: &[&str] = &["2", "5", "10"];
const DEFAULT_LEAD_MINUTES: i64 = 5;

const MAX_OPEN_ITEMS: usize = 8;
const MAX_DOCUMENTS: usize = 3;
const MAX_SUMMARY_CHARS: usize = 320;
/// Enough of the agenda to search on; invites trail off into dial-ins.
const MAX_QUERY_CHARS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MeetingBrief {
    pub event: CalendarEvent,
    pub attendees: Vec<BriefAttendee>,
    pub open_items: Vec<BriefItem>,
    /// The latest meeting in the same series, if you've had one.
    pub last_meeting: Option<LastMeeting>,
    pub documents: Vec<BriefDocument>,
}

/// An invitee, matched to someone you've met when Nootle knows them.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BriefAttendee {
    pub name: String,
    /// Their name in People, when it differs from the calendar's ("Ana").
    pub person: Option<String>,
    pub last_met: Option<String>,
    pub meeting_count: i64,
}

/// Something still open going into the meeting. Action items today; other
/// open loops (commitments, say) can be added in `open_items`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BriefItem {
    pub id: String,
    pub content: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub meeting_id: String,
    pub meeting_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LastMeeting {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub decisions: Vec<String>,
    /// The start of its summary, for meetings without extracted decisions.
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BriefDocument {
    pub document_id: String,
    pub title: String,
    pub locator: Option<String>,
    pub snippet: String,
}

impl MeetingBrief {
    /// Briefs are for meetings with other people, or ones you've had before.
    pub fn worth_showing(&self) -> bool {
        self.event.attendee_count > 0 || self.last_meeting.is_some()
    }
}

/// Minutes before a meeting its brief appears.
pub fn lead_minutes(db: &Database) -> i64 {
    db.get_setting(LEAD_SETTING)
        .ok()
        .flatten()
        .filter(|v| LEAD_CHOICES.contains(&v.as_str()))
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_LEAD_MINUTES)
}

/// Identifies one occurrence of an event: repeats share an identifier.
pub fn occurrence_key(event: &CalendarEvent) -> String {
    format!("{}@{}", event.id, event.start)
}

/// Events starting within `lead` minutes of `now` that haven't had a brief.
/// Day-long blocks are left out: they're holidays and travel, not meetings.
pub fn due_events<'a>(
    events: &'a [CalendarEvent],
    now: DateTime<Utc>,
    lead: i64,
    shown: &HashSet<String>,
) -> Vec<&'a CalendarEvent> {
    events
        .iter()
        .filter(|e| {
            let (Some(start), Some(end)) = (
                crate::calendar::parse(&e.start),
                crate::calendar::parse(&e.end),
            ) else {
                return false;
            };
            start > now
                && start <= now + Duration::minutes(lead)
                && end - start < Duration::hours(24)
                && !shown.contains(&occurrence_key(e))
        })
        .collect()
}

fn normalize_title(title: &str) -> String {
    title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Everything in the brief but the documents, which need the search model
/// (see `relevant_documents`).
pub fn assemble(
    db: &Database,
    event: CalendarEvent,
    documents: Vec<BriefDocument>,
) -> Result<MeetingBrief> {
    // The same series the Meetings page shows: recorded from this event, or
    // with the same title.
    let title = normalize_title(&event.title);
    let series: Vec<_> = db
        .list_meetings(None, false, None)?
        .into_iter()
        .filter(|m| m.status != "recording")
        .filter(|m| {
            m.calendar_event_id.as_deref() == Some(event.id.as_str())
                || normalize_title(&m.title) == title
        })
        .collect();

    let people = db.list_people()?;
    let attendees: Vec<BriefAttendee> = event
        .attendees
        .iter()
        .map(|name| {
            let person = match_person(name, &people);
            BriefAttendee {
                name: name.clone(),
                person: person.map(|p| p.name.clone()).filter(|p| p != name),
                last_met: person.map(|p| p.last_met.clone()),
                meeting_count: person.map_or(0, |p| p.meeting_count),
            }
        })
        .collect();

    let series_ids: HashSet<&str> = series.iter().map(|m| m.id.as_str()).collect();
    let open_items = open_items(db, &attendees, &series_ids)?;

    let last_meeting = match series.first() {
        Some(last) => {
            let decisions: Vec<String> = db
                .get_insights_for_meeting(&last.id)?
                .into_iter()
                .filter(|i| i.insight_type == "decision")
                .map(|i| i.content)
                .collect();
            let summary = if decisions.is_empty() {
                db.get_summaries_for_meeting(&last.id)?
                    .first()
                    .map(|s| summary_excerpt(&s.content))
                    .filter(|s| !s.is_empty())
            } else {
                None
            };
            Some(LastMeeting {
                id: last.id.clone(),
                title: last.title.clone(),
                start_time: last.start_time.clone(),
                decisions,
                summary,
            })
        }
        None => None,
    };

    Ok(MeetingBrief {
        event,
        attendees,
        open_items,
        last_meeting,
        documents,
    })
}

/// The person an invitee is: the same name, or, when People only knows a
/// first name ("Ana" for "Ana Lima"), the one person with it.
fn match_person<'a>(attendee: &str, people: &'a [Person]) -> Option<&'a Person> {
    if let Some(p) = people
        .iter()
        .find(|p| p.name.eq_ignore_ascii_case(attendee))
    {
        return Some(p);
    }
    let first = attendee.split_whitespace().next()?;
    let mut by_first = people
        .iter()
        .filter(|p| !p.name.contains(' ') && p.name.eq_ignore_ascii_case(first));
    match (by_first.next(), by_first.next()) {
        (Some(p), None) => Some(p),
        _ => None,
    }
}

/// Open action items owned by someone coming, or from this meeting series.
fn open_items(
    db: &Database,
    attendees: &[BriefAttendee],
    series_ids: &HashSet<&str>,
) -> Result<Vec<BriefItem>> {
    let owners: HashSet<String> = attendees
        .iter()
        .flat_map(|a| [Some(&a.name), a.person.as_ref()])
        .flatten()
        .map(|n| n.to_lowercase())
        .collect();
    Ok(db
        .get_all_insights(None, Some("action_item"), Some("open"), None)?
        .into_iter()
        .filter(|i| {
            series_ids.contains(i.meeting_id.as_str())
                || i.assignee
                    .as_ref()
                    .is_some_and(|a| owners.contains(&a.to_lowercase()))
        })
        .take(MAX_OPEN_ITEMS)
        .map(|i| BriefItem {
            id: i.action_item_id.unwrap_or(i.id),
            content: i.content,
            assignee: i.assignee,
            due_date: i.due_date,
            meeting_id: i.meeting_id,
            meeting_title: i.meeting_title,
        })
        .collect())
}

/// The first prose of a Markdown summary, without headings or bullets.
fn summary_excerpt(summary: &str) -> String {
    let text = summary
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.trim_start_matches(['-', '*', ' ']).replace("**", ""))
        .collect::<Vec<_>>()
        .join(" ");
    crate::ops::truncate_at_word_boundary(&text, MAX_SUMMARY_CHARS, "…")
}

/// What the event is about, to search the knowledge base with.
pub fn search_query(event: &CalendarEvent) -> String {
    let agenda = event.notes.as_deref().unwrap_or_default().trim();
    crate::ops::truncate_at_word_boundary(
        &format!("{}\n{agenda}", event.title),
        MAX_QUERY_CHARS,
        "",
    )
}

/// The knowledge-base documents closest to `query`, one entry per document.
/// Without the search model's `embedding`, matches on keywords alone.
pub fn relevant_documents(
    db: &Database,
    embedding: Option<&[f32]>,
    query: &str,
) -> Result<Vec<BriefDocument>> {
    if !db.has_knowledge()? {
        return Ok(Vec::new());
    }
    let hits: Vec<KnowledgeHit> = match embedding {
        Some(embedding) => crate::knowledge::search(db, embedding, query, &[], &[], 12)?,
        None => db.search_knowledge_keywords(query, 12, &[], &[])?,
    };
    let mut seen = HashSet::new();
    Ok(hits
        .into_iter()
        .filter(|h| seen.insert(h.document_id.clone()))
        .take(MAX_DOCUMENTS)
        .map(|h| BriefDocument {
            snippet: crate::ops::truncate_at_word_boundary(&h.text, 160, "…"),
            document_id: h.document_id,
            title: h.document_title,
            locator: h.locator,
        })
        .collect())
}

/// The whole brief for `event`. `embed` turns the search query into the
/// search model's vector; without one, documents match on keywords.
pub fn build(
    db: &Database,
    event: CalendarEvent,
    embed: impl FnOnce(&str) -> Option<Vec<f32>>,
) -> Result<MeetingBrief> {
    let query = search_query(&event);
    let documents = relevant_documents(db, embed(&query).as_deref(), &query)?;
    assemble(db, event, documents)
}

/// The brief for the event with `event_id`, or for the next one in the
/// next 12 hours, for the CLI and MCP server. `None` without such an event
/// (or calendar access).
pub fn for_event(
    db: &Database,
    event_id: Option<&str>,
    embed: impl FnOnce(&str) -> Option<Vec<f32>>,
) -> Result<Option<MeetingBrief>> {
    let event = match event_id {
        Some(id) => crate::calendar::event_by_id(id),
        None => crate::calendar::upcoming(12).events.into_iter().next(),
    };
    event.map(|e| build(db, e, embed)).transpose()
}

/// The brief as text for the model.
fn prompt_context(brief: &MeetingBrief) -> String {
    let mut out = crate::calendar::format_context(&(&brief.event).into())
        .trim_start()
        .to_string();
    if let Some(last) = &brief.last_meeting {
        out.push_str(&format!("\nLast time ({}):", last.start_time));
        for decision in &last.decisions {
            out.push_str(&format!("\n- Decided: {decision}"));
        }
        if let Some(summary) = &last.summary {
            out.push_str(&format!("\n{summary}"));
        }
    }
    if !brief.open_items.is_empty() {
        out.push_str("\nOpen action items:");
        for item in &brief.open_items {
            let owner = item.assignee.as_deref().unwrap_or("unassigned");
            out.push_str(&format!("\n- {} ({owner})", item.content));
        }
    }
    if !brief.documents.is_empty() {
        out.push_str("\nRelated documents:");
        for doc in &brief.documents {
            out.push_str(&format!("\n- {}: {}", doc.title, doc.snippet));
        }
    }
    out
}

/// Two or three sentences on what to cover, from the model automatic work
/// uses. `None` without a model, which in Local-only mode means without a
/// local one.
pub async fn synthesize(
    db: &Database,
    llm: &LlmRegistry,
    brief: &MeetingBrief,
) -> Result<Option<String>> {
    crate::llm::sync_local_only(db);
    let Some(model) = crate::ops::pick_auto_model(db, llm) else {
        return Ok(None);
    };
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: "You prepare someone for a meeting that starts in a few minutes. From the \
                      brief below, say in two or three short sentences what they should make \
                      sure to cover: open items to follow up on, decisions to build on, and \
                      anything the agenda needs. Be specific; no preamble, no bullets."
                .into(),
        },
        ChatMessage {
            role: "user".into(),
            content: prompt_context(brief),
        },
    ];
    let reply = crate::ops::chat(llm, &model.provider, &model.id, messages).await?;
    Ok(Some(reply.trim().to_string()).filter(|r| !r.is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewActionItem, NewInsight, NewMeeting, NewSummary, NewTranscriptSegment};

    fn event(title: &str, attendees: &[&str], start: DateTime<Utc>) -> CalendarEvent {
        CalendarEvent {
            id: "ev-1".into(),
            title: title.into(),
            start: start.to_rfc3339(),
            end: (start + Duration::minutes(30)).to_rfc3339(),
            calendar: None,
            location: None,
            meeting_url: None,
            attendee_count: attendees.len(),
            attendees: attendees.iter().map(|a| a.to_string()).collect(),
            notes: Some("1. Pricing page\n2. Launch date".into()),
        }
    }

    fn meeting(db: &Database, title: &str, speaker: &str) -> String {
        let m = db
            .create_meeting(NewMeeting {
                title: title.into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        db.update_meeting_status(&m.id, "summarized").unwrap();
        db.create_transcript_segment(NewTranscriptSegment {
            meeting_id: m.id.clone(),
            speaker_label: speaker.into(),
            text: "Let's ship it.".into(),
            start_ms: 0,
            end_ms: 2_000,
            confidence: 0.9,
        })
        .unwrap();
        m.id
    }

    fn insight(db: &Database, meeting_id: &str, kind: &str, content: &str, owner: Option<&str>) {
        let insight = db
            .create_insight(NewInsight {
                meeting_id: meeting_id.into(),
                insight_type: kind.into(),
                content: content.into(),
                context: None,
                transcript_start_ms: None,
                transcript_end_ms: None,
            })
            .unwrap();
        if kind == "action_item" {
            db.create_action_item(NewActionItem {
                insight_id: insight.id,
                assignee: owner.map(str::to_string),
                due_date: None,
            })
            .unwrap();
        }
    }

    #[test]
    fn assembles_people_items_and_last_decisions() {
        let db = Database::new_in_memory().unwrap();
        let older = meeting(&db, "Weekly  Sync", "Ana");
        insight(&db, &older, "decision", "Old decision", None);
        let last = meeting(&db, "weekly sync", "Ana");
        insight(&db, &last, "decision", "Launch on May 4", None);
        insight(&db, &last, "action_item", "Draft the FAQ", Some("Sam"));
        let other = meeting(&db, "Hiring", "Sam");
        insight(&db, &other, "action_item", "Send the offer", Some("Ana"));
        insight(&db, &other, "action_item", "Book the room", Some("Lee"));

        let brief = assemble(
            &db,
            event("Weekly Sync", &["Ana Lima", "Priya Shah"], Utc::now()),
            Vec::new(),
        )
        .unwrap();

        assert!(brief.worth_showing());
        assert_eq!(brief.attendees[0].person.as_deref(), Some("Ana"));
        assert_eq!(brief.attendees[0].meeting_count, 2);
        assert!(brief.attendees[0].last_met.is_some());
        assert_eq!(brief.attendees[1].last_met, None);

        let items: Vec<&str> = brief
            .open_items
            .iter()
            .map(|i| i.content.as_str())
            .collect();
        assert!(items.contains(&"Draft the FAQ"), "from the series");
        assert!(items.contains(&"Send the offer"), "owned by Ana");
        assert!(!items.contains(&"Book the room"));

        let last_meeting = brief.last_meeting.unwrap();
        assert_eq!(last_meeting.id, last);
        assert_eq!(last_meeting.decisions, vec!["Launch on May 4"]);
        assert_eq!(last_meeting.summary, None);
    }

    #[test]
    fn falls_back_to_the_summary_without_decisions() {
        let db = Database::new_in_memory().unwrap();
        let id = meeting(&db, "Roadmap", "Ana");
        db.create_summary(NewSummary {
            meeting_id: id.clone(),
            template_id: None,
            provider: "ollama".into(),
            model: "m".into(),
            content: "## Summary\n- We agreed the **beta** slips a week.\n".into(),
        })
        .unwrap();
        let brief = assemble(&db, event("Roadmap", &[], Utc::now()), Vec::new()).unwrap();
        assert_eq!(
            brief.last_meeting.unwrap().summary.as_deref(),
            Some("We agreed the beta slips a week.")
        );
    }

    #[test]
    fn skips_solo_events_without_history() {
        let db = Database::new_in_memory().unwrap();
        let brief = assemble(&db, event("Focus time", &[], Utc::now()), Vec::new()).unwrap();
        assert!(!brief.worth_showing());
        assert!(brief.open_items.is_empty());
    }

    #[test]
    fn matches_first_names_only_when_unambiguous() {
        let person = |name: &str| Person {
            name: name.into(),
            meeting_count: 1,
            last_met: String::new(),
            talk_time_ms: 0,
            open_action_items: 0,
        };
        let people = vec![
            person("ana lima"),
            person("Sam"),
            person("Lee"),
            person("lee"),
        ];
        assert_eq!(match_person("Ana Lima", &people).unwrap().name, "ana lima");
        assert_eq!(match_person("Sam Ortiz", &people).unwrap().name, "Sam");
        assert!(match_person("Lee Chen", &people).is_none());
        assert!(match_person("Priya", &people).is_none());
    }

    #[test]
    fn picks_events_inside_the_lead_time_once() {
        let now = Utc::now();
        let mut soon = event("Soon", &["Ana"], now + Duration::minutes(4));
        soon.id = "soon".into();
        let mut later = event("Later", &["Ana"], now + Duration::minutes(20));
        later.id = "later".into();
        let mut started = event("Started", &["Ana"], now - Duration::minutes(1));
        started.id = "started".into();
        let mut all_day = event("Offsite", &["Ana"], now + Duration::minutes(2));
        all_day.id = "all-day".into();
        all_day.end = (now + Duration::hours(26)).to_rfc3339();
        let events = vec![soon.clone(), later, started, all_day];

        let mut shown = HashSet::new();
        let due: Vec<&str> = due_events(&events, now, 5, &shown)
            .iter()
            .map(|e| e.id.as_str())
            .collect();
        assert_eq!(due, vec!["soon"]);

        shown.insert(occurrence_key(&soon));
        assert!(due_events(&events, now, 5, &shown).is_empty());
        assert_eq!(due_events(&events, now, 30, &shown).len(), 1);
    }

    #[test]
    fn reads_the_lead_time_setting() {
        let db = Database::new_in_memory().unwrap();
        assert_eq!(lead_minutes(&db), 5);
        db.set_setting(LEAD_SETTING, "10").unwrap();
        assert_eq!(lead_minutes(&db), 10);
        db.set_setting(LEAD_SETTING, "45").unwrap();
        assert_eq!(lead_minutes(&db), 5);
    }

    #[test]
    fn finds_related_documents_by_keyword() {
        let db = Database::new_in_memory().unwrap();
        assert!(relevant_documents(&db, None, "pricing").unwrap().is_empty());
        let source = db
            .create_knowledge_source("folder", "/docs", "Docs", &[])
            .unwrap();
        for (title, text) in [
            ("Pricing plan", "The pricing page lists three tiers."),
            ("Pricing plan", "Pricing tiers start at ten dollars."),
            ("Holiday list", "The office closes in December."),
        ] {
            let doc = crate::db::NewKnowledgeDocument {
                source_id: &source.id,
                location: &format!("/docs/{title}-{}", text.len()),
                title,
                kind: "md",
                signature: "s",
                content_hash: text,
            };
            let chunk = crate::db::NewKnowledgeChunk {
                locator: None,
                text: text.into(),
            };
            db.replace_knowledge_document(&doc, &[(chunk, vec![0.0; 384])])
                .unwrap();
        }
        let docs = relevant_documents(&db, None, &search_query(&event("Pricing", &[], Utc::now())))
            .unwrap();
        assert!(!docs.is_empty());
        assert!(docs.iter().all(|d| d.title == "Pricing plan"));
    }

    #[test]
    fn prompt_carries_the_brief() {
        let db = Database::new_in_memory().unwrap();
        let id = meeting(&db, "Sync", "Ana");
        insight(&db, &id, "decision", "Ship Friday", None);
        insight(&db, &id, "action_item", "Write notes", Some("Ana"));
        let brief = assemble(&db, event("Sync", &["Ana"], Utc::now()), Vec::new()).unwrap();
        let prompt = prompt_context(&brief);
        assert!(prompt.contains("\"Sync\""));
        assert!(prompt.contains("Pricing page"));
        assert!(prompt.contains("- Decided: Ship Friday"));
        assert!(prompt.contains("- Write notes (Ana)"));
    }
}
