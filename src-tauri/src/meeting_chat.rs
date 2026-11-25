//! Ask Nootle inside a meeting: answers questions about the meeting and, when
//! the user asks, changes it the way the CLI and MCP server can (notes, title,
//! labels, action items, summaries, speakers, timeline comments), files a
//! Linear issue when Linear is connected, or adds a page to Notion or
//! Confluence when a workflow for it names where pages go.
//!
//! Every provider here is text in, text out, so instead of native tool calls
//! the model asks for changes in a fenced `nootle-actions` block of JSON.
//! The block is cut from the reply, each change is run against this meeting
//! only, and the outcome of each is returned so the chat can show it.

use std::collections::BTreeSet;

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};

use crate::db::{AnnotationKind, Database, NewMeetingAnnotation};
use crate::llm::{ChatMessage, LlmRegistry};
use crate::ops;
use crate::workflows::Wiki;

/// The fence that opens a block of changes in the model's reply.
const ACTIONS_FENCE: &str = "```nootle-actions";
/// How much of the current notes the model sees, in characters.
const NOTES_PREVIEW_CHARS: usize = 6_000;
/// Who comments the chat pins to the timeline are shown as by.
const ANNOTATION_AUTHOR: &str = "Ask Nootle";

/// App events that refresh the views a change touched. The meeting's own
/// update event carries the meeting, so it's `MEETING_UPDATED`; the rest
/// carry its ID. Timeline comments need none: the timeline polls.
pub const MEETING_UPDATED: &str = "meeting-updated";
const LABELS: &[&str] = &["labels-updated"];
const INSIGHTS: &[&str] = &["insights-updated"];
const SUMMARIES: &[&str] = &["summaries-updated"];
const TRANSCRIPT: &[&str] = &["transcript-replaced", "analytics-ready"];

/// A change the model asked for, scoped to the open meeting.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ChatAction {
    AddToNotes {
        markdown: String,
    },
    RenameMeeting {
        title: String,
    },
    AddLabels {
        labels: Vec<String>,
    },
    RemoveLabels {
        labels: Vec<String>,
    },
    AddActionItem {
        task: String,
        assignee: Option<String>,
        due_date: Option<String>,
    },
    UpdateActionItem {
        id: String,
        status: Option<String>,
        assignee: Option<String>,
        due_date: Option<String>,
    },
    Summarize {
        template: String,
    },
    RenameSpeaker {
        from: String,
        to: String,
    },
    AddComment {
        at: String,
        text: String,
    },
    CreateLinearIssue {
        title: String,
        description: Option<String>,
    },
    CreateNotionPage {
        title: String,
        markdown: String,
    },
    CreateConfluencePage {
        title: String,
        markdown: String,
    },
}

/// One change's result, worded for the user: "Added to your notes", or why
/// it failed.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ActionOutcome {
    pub ok: bool,
    pub summary: String,
    /// Where the change can be seen outside Nootle, such as a new issue.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// A change made: what to tell the user, a link to it outside Nootle, and the
/// events that refresh what it touched.
#[derive(Debug)]
struct Done {
    summary: String,
    url: Option<String>,
    events: &'static [&'static str],
}

impl From<Done> for ActionOutcome {
    fn from(done: Done) -> Self {
        ActionOutcome {
            ok: true,
            summary: done.summary,
            url: done.url,
        }
    }
}

/// Linear, opened on the first issue a reply files and reused for the rest,
/// with the team and project issues go to.
type LinearTarget = (crate::linear::Linear, String, Option<String>);

#[derive(Debug, Default, Serialize)]
pub struct MeetingChatReply {
    pub reply: String,
    pub actions: Vec<ActionOutcome>,
    /// The app events to send so open views show the changes.
    #[serde(skip)]
    pub events: BTreeSet<&'static str>,
}

/// Answers `user_message` about a meeting, then makes any changes the reply
/// asks for.
pub async fn chat(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    user_message: &str,
    history: Vec<ChatMessage>,
    provider_name: &str,
    model: &str,
) -> Result<MeetingChatReply> {
    let provider = llm
        .get_provider(provider_name)
        .ok_or_else(|| anyhow!("Provider '{}' not found", provider_name))?;
    let transcript = db.get_transcript(meeting_id)?;
    let system = format!(
        "{}\n\n{}\n\n{}",
        crate::summarization::transcript_chat_prompt(db, meeting_id, &transcript),
        meeting_state(db, meeting_id, &transcript)?,
        actions_guide(db)
    );
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: system,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".into(),
        content: user_message.to_string(),
    });
    let raw = provider.chat(messages, model).await?;

    let (reply, requested) = split_actions(&raw);
    let mut out = MeetingChatReply {
        reply,
        ..Default::default()
    };
    let mut linear = None;
    for action in requested {
        let result = match action {
            Ok(action) => {
                run(
                    db,
                    llm,
                    &mut linear,
                    meeting_id,
                    action,
                    provider_name,
                    model,
                )
                .await
            }
            Err(e) => Err(e),
        };
        out.actions.push(match result {
            Ok(done) => {
                out.events.extend(done.events);
                done.into()
            }
            Err(e) => ActionOutcome {
                ok: false,
                summary: e.to_string(),
                url: None,
            },
        });
    }
    Ok(out)
}

const ACTIONS_GUIDE: &str = r###"## Changing this meeting

You can also change this meeting when the user asks you to (e.g. "put those in my notes", "tag this as Interview", "add an action item for me to email Dena", "mark that done", "write a follow-up email summary", "Speaker 2 is Priya"). To do so, end your reply with one block like this, listing every change:

```nootle-actions
[
  {"action": "add_to_notes", "markdown": "## Questions to ask\n- ..."},
  {"action": "rename_meeting", "title": "..."},
  {"action": "add_labels", "labels": ["Interview"]},
  {"action": "remove_labels", "labels": ["..."]},
  {"action": "add_action_item", "task": "...", "assignee": "name or null", "due_date": "YYYY-MM-DD or null"},
  {"action": "update_action_item", "id": "action item id from the list above", "status": "open|done|cancelled", "assignee": "...", "due_date": "YYYY-MM-DD, or \"\" to clear"},
  {"action": "summarize", "template": "summary template name from the list above"},
  {"action": "rename_speaker", "from": "Speaker 2", "to": "Priya"},
  {"action": "add_comment", "at": "mm:ss", "text": "a comment pinned to that moment of the timeline"}
]
```

Rules:
- Only include the block when the user asks for a change. Never change anything they didn't ask for.
- add_to_notes appends to the end of the user's notes; it never replaces them. Write the full content to add as Markdown. When the user points at something earlier in the conversation ("those", "that list"), copy it in full, not a reference to it.
- Labels not yet created are created. In update_action_item, omit fields you aren't changing.
- Above the block, say briefly what you did, as done. Nootle runs each change and shows the user whether it worked, so don't repeat the content you added.
- You can't delete meetings or run workflows. If asked, say so and point the user to the meeting's menus."###;

const NO_SENDING: &str = "- You can't send anything outside Nootle. If asked, say so.";

const LINEAR_GUIDE: &str = r###"## Filing in Linear

Linear is connected. When the user asks for an issue or ticket ("file that in Linear", "make a ticket for the explainer copy"), add this to the block, one per issue:

  {"action": "create_linear_issue", "title": "under 80 characters, what needs doing", "description": "Markdown: what needs doing, why, and who owns it, from this meeting"}

Nootle files it in their default Linear team and links it under your reply."###;

/// How to add a page to `wiki`, which a workflow already writes pages to.
fn wiki_guide(wiki: Wiki) -> String {
    let (name, place) = (wiki.name(), wiki.place());
    let tag = name.to_lowercase();
    format!(
        r###"## Pages in {name}

{name} is connected. When the user asks for a {name} page or doc ("put the decisions in {name}", "write this up as a {name} page"), add this to the block, one per page:

  {{"action": "create_{tag}_page", "title": "the page's title", "markdown": "the full page as Markdown (headings, bullet lists, paragraphs), written from this meeting"}}

Nootle adds it to the {name} {place} their meeting workflow uses and links it under your reply."###
    )
}

const ONLY_WHAT_WAS_ASKED: &str =
    "Only send what the user asked for. Nothing else can be sent outside Nootle.";

fn ensure_may_act(db: &Database) -> Result<(), String> {
    crate::llm::ensure_may_send_to_integrations(db)?;
    crate::account::require_pro(db, crate::account::ProFeature::Actions)
}

/// The changes the model may ask for: always the meeting's own, plus Linear
/// issues and Notion or Confluence pages when those are set up and meetings
/// may leave this Mac.
fn actions_guide(db: &Database) -> String {
    if ensure_may_act(db).is_err() {
        return format!("{ACTIONS_GUIDE}\n{NO_SENDING}");
    }
    let mut tools = Vec::new();
    if crate::linear::is_connected(db) {
        tools.push(LINEAR_GUIDE.to_string());
    }
    for wiki in [Wiki::Notion, Wiki::Confluence] {
        if wiki.target(db).is_some() {
            tools.push(wiki_guide(wiki));
        }
    }
    if tools.is_empty() {
        format!("{ACTIONS_GUIDE}\n{NO_SENDING}")
    } else {
        format!(
            "{ACTIONS_GUIDE}\n\n{}\n\n{ONLY_WHAT_WAS_ASKED}",
            tools.join("\n\n")
        )
    }
}

/// The meeting as it stands, for the model to act on: title, labels, notes,
/// action items, speakers, and the templates and labels it can use.
fn meeting_state(
    db: &Database,
    meeting_id: &str,
    transcript: &[crate::db::TranscriptSegment],
) -> Result<String> {
    let meeting = db.get_meeting(meeting_id)?;
    let names = |labels: Vec<crate::db::Label>| {
        labels
            .into_iter()
            .map(|l| l.name)
            .collect::<Vec<_>>()
            .join(", ")
    };
    let templates = db
        .list_templates()?
        .into_iter()
        .map(|t| t.name)
        .collect::<Vec<_>>()
        .join(", ");
    let notes = ops::shown_notes(&meeting).0.trim();
    let notes = match notes.char_indices().nth(NOTES_PREVIEW_CHARS) {
        _ if notes.is_empty() => "(none yet)".to_string(),
        Some((cut, _)) => format!("{}\n…(longer; you only see the start)", &notes[..cut]),
        None => notes.to_string(),
    };
    let action_items = db
        .get_insights_for_meeting(meeting_id)?
        .into_iter()
        .filter_map(|i| {
            let id = i.action_item_id?;
            let mut line = format!("- [{id}] {} ({})", i.content, i.status.unwrap_or_default());
            if let Some(a) = i.assignee.filter(|a| !a.is_empty()) {
                line += &format!(", assignee: {a}");
            }
            if let Some(d) = i.due_date.filter(|d| !d.is_empty()) {
                line += &format!(", due {d}");
            }
            Some(line)
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        "## This meeting now\n\
         Today is {today}.\n\
         Title: {title}\n\
         Labels: {labels}\n\
         Speakers: {speakers}\n\
         Action items:\n{items}\n\
         The user's notes:\n<notes>\n{notes}\n</notes>\n\
         All labels: {all_labels}\n\
         Summary templates: {templates}",
        today = crate::commitments::today(),
        title = meeting.title,
        labels = or_none(names(db.get_meeting_labels(meeting_id)?)),
        speakers = or_none(crate::room_recap::speakers_in_order(transcript).join(", ")),
        items = or_none(action_items),
        all_labels = or_none(names(db.list_labels()?)),
        templates = or_none(templates),
    ))
}

fn or_none(s: String) -> String {
    if s.is_empty() {
        "(none)".into()
    } else {
        s
    }
}

/// Cuts every `nootle-actions` block out of a reply, returning the text left
/// and the changes the blocks asked for. A block that isn't valid JSON, or a
/// change Nootle doesn't know, comes back as an error to show the user.
pub fn split_actions(raw: &str) -> (String, Vec<Result<ChatAction>>) {
    let mut text = String::new();
    let mut actions = Vec::new();
    let mut rest = raw;
    while let Some(start) = rest.find(ACTIONS_FENCE) {
        text.push_str(&rest[..start]);
        let body_start = start + ACTIONS_FENCE.len();
        let (body, after) = match rest[body_start..].find("```") {
            Some(end) => (
                &rest[body_start..body_start + end],
                &rest[body_start + end + 3..],
            ),
            None => (&rest[body_start..], ""),
        };
        actions.extend(parse_actions(body));
        rest = after;
    }
    text.push_str(rest);
    (text.trim().to_string(), actions)
}

fn parse_actions(body: &str) -> Vec<Result<ChatAction>> {
    let items = match serde_json::from_str::<serde_json::Value>(body.trim()) {
        Ok(serde_json::Value::Array(items)) => items,
        Ok(item @ serde_json::Value::Object(_)) => vec![item],
        _ => {
            return vec![Err(anyhow!(
                "Couldn't read the changes Nootle asked for, so nothing was changed"
            ))]
        }
    };
    items
        .into_iter()
        .map(|item| {
            let name = item["action"].as_str().unwrap_or("?").to_string();
            serde_json::from_value(item)
                .map_err(|_| anyhow!("Skipped a change Nootle can't make ({name})"))
        })
        .collect()
}

/// Runs one change on the meeting.
async fn run(
    db: &Database,
    llm: &LlmRegistry,
    linear: &mut Option<LinearTarget>,
    meeting_id: &str,
    action: ChatAction,
    provider: &str,
    model: &str,
) -> Result<Done> {
    let (summary, events): (String, &'static [&'static str]) = match action {
        ChatAction::AddToNotes { markdown } => {
            ops::append_notes(db, meeting_id, &markdown)?;
            ("Added to your notes".into(), &[MEETING_UPDATED])
        }
        ChatAction::RenameMeeting { title } => {
            let patch = ops::MeetingPatch {
                title: Some(title),
                ..Default::default()
            };
            let meeting = ops::update_meeting(db, meeting_id, patch)?;
            (
                format!("Renamed the meeting “{}”", meeting.title),
                &[MEETING_UPDATED],
            )
        }
        ChatAction::AddLabels { labels } => {
            let labels = ops::ensure_labels(db, &labels)?;
            for label in &labels {
                db.add_meeting_label(meeting_id, &label.id)?;
            }
            (format!("Added {}", label_list(labels)), LABELS)
        }
        ChatAction::RemoveLabels { labels } => {
            let all = db.list_labels()?;
            let labels = labels
                .iter()
                .map(|key| ops::find_label(&all, key.trim()).cloned())
                .collect::<Result<Vec<_>>>()?;
            for label in &labels {
                db.remove_meeting_label(meeting_id, &label.id)?;
            }
            (format!("Removed {}", label_list(labels)), LABELS)
        }
        ChatAction::AddActionItem {
            task,
            assignee,
            due_date,
        } => {
            let item = ops::add_action_item(
                db,
                meeting_id,
                &task,
                assignee.as_deref(),
                due_date.as_deref(),
            )?;
            (format!("Added action item “{}”", item.content), INSIGHTS)
        }
        ChatAction::UpdateActionItem {
            id,
            status,
            assignee,
            due_date,
        } => {
            if db.get_insight_by_action_item(&id)?.meeting_id != meeting_id {
                bail!("That action item belongs to another meeting");
            }
            if let Some(date) = due_date.as_deref().filter(|d| !d.trim().is_empty()) {
                ops::validate_due_date(date)?;
            }
            let item = ops::update_action_item(
                db,
                &id,
                status.as_deref(),
                assignee.as_deref(),
                due_date.as_deref(),
            )?;
            let status = item.status.unwrap_or_default();
            (format!("Updated “{}” ({status})", item.content), INSIGHTS)
        }
        ChatAction::Summarize { template } => {
            let template = db
                .list_templates()?
                .into_iter()
                .find(|t| t.id == template || t.name.eq_ignore_ascii_case(template.trim()))
                .ok_or_else(|| anyhow!("No summary template named “{template}”"))?;
            crate::summarization::summarize_meeting(
                db,
                llm,
                meeting_id,
                &template.id,
                provider,
                model,
            )
            .await?;
            (format!("Wrote a {} summary", template.name), SUMMARIES)
        }
        ChatAction::RenameSpeaker { from, to } => {
            if ops::rename_speaker(db, None, meeting_id, &from, &to)? == 0 {
                bail!("No one called “{from}” speaks in this meeting");
            }
            (format!("Renamed {from} to {}", to.trim()), TRANSCRIPT)
        }
        ChatAction::AddComment { at, text } => {
            let start_ms = crate::transcript_import::timestamp_ms(&at)
                .ok_or_else(|| anyhow!("“{at}” isn't a time like 14:32"))?;
            ops::add_annotation(
                db,
                NewMeetingAnnotation {
                    meeting_id: meeting_id.to_string(),
                    start_ms,
                    end_ms: None,
                    kind: AnnotationKind::Comment,
                    body: text,
                    author: ANNOTATION_AUTHOR.into(),
                    by_user: false,
                },
            )?;
            let at = crate::summarization::format_ms(start_ms);
            (format!("Pinned a comment at {at}"), &[])
        }
        ChatAction::CreateLinearIssue { title, description } => {
            return create_linear_issue(db, linear, meeting_id, &title, description.as_deref())
                .await;
        }
        ChatAction::CreateNotionPage { title, markdown } => {
            return create_wiki_page(db, meeting_id, Wiki::Notion, &title, &markdown).await;
        }
        ChatAction::CreateConfluencePage { title, markdown } => {
            return create_wiki_page(db, meeting_id, Wiki::Confluence, &title, &markdown).await;
        }
    };
    Ok(Done {
        summary,
        url: None,
        events,
    })
}

/// Files an issue in the default Linear team, noting the meeting it came
/// from.
async fn create_linear_issue(
    db: &Database,
    linear: &mut Option<LinearTarget>,
    meeting_id: &str,
    title: &str,
    description: Option<&str>,
) -> Result<Done> {
    let title = title.trim();
    if title.is_empty() {
        bail!("Skipped a Linear issue with no title");
    }
    ensure_may_act(db).map_err(|e| anyhow!(e))?;
    let footer = source_note(db, meeting_id)?;
    let description = match description.map(str::trim).filter(|d| !d.is_empty()) {
        Some(d) => format!("{d}\n\n{footer}"),
        None => footer,
    };
    let (client, team, project) = match linear.take() {
        Some(target) => target,
        None => {
            let client = crate::linear::Linear::connected(db)
                .await
                .map_err(|e| anyhow!(e))?;
            let (team, project) = client.defaults(db).await.map_err(|e| anyhow!(e))?;
            (client, team, project)
        }
    };
    let issue = client
        .create_issue(&team, project.as_deref(), title, &description)
        .await;
    *linear = Some((client, team, project));
    let issue = issue.map_err(|e| anyhow!(e))?;
    let name = if issue.identifier.is_empty() {
        "a Linear issue".to_string()
    } else {
        issue.identifier
    };
    Ok(Done {
        summary: format!("Filed {name} “{title}”"),
        url: Some(issue.url).filter(|u| !u.is_empty()),
        events: &[],
    })
}

/// Adds a page where the wiki's workflow puts them, noting the meeting it
/// came from.
async fn create_wiki_page(
    db: &Database,
    meeting_id: &str,
    wiki: Wiki,
    title: &str,
    markdown: &str,
) -> Result<Done> {
    let name = wiki.name();
    let title = title.trim();
    if title.is_empty() {
        bail!("Skipped a {name} page with no title");
    }
    ensure_may_act(db).map_err(|e| anyhow!(e))?;
    let (integration, location) = wiki
        .target(db)
        .ok_or_else(|| anyhow!("Set up a {name} workflow first, so Nootle knows where pages go"))?;
    let content = format!("{}\n\n{}", markdown.trim(), source_note(db, meeting_id)?);
    let page = wiki
        .create_page(db, &integration, &location, title, &content)
        .await
        .map_err(|e| anyhow!(e))?;
    Ok(Done {
        summary: format!("Added “{title}” to {name}"),
        url: page.output,
        events: &[],
    })
}

/// The line under anything sent out of Nootle saying which meeting it's from.
fn source_note(db: &Database, meeting_id: &str) -> Result<String> {
    Ok(format!(
        "---\nFrom the meeting “{}” in Nootle.",
        db.get_meeting(meeting_id)?.title
    ))
}

/// "label Interview" or "labels Interview, Hiring".
fn label_list(labels: Vec<crate::db::Label>) -> String {
    let s = if labels.len() == 1 { "" } else { "s" };
    let names: Vec<_> = labels.into_iter().map(|l| l.name).collect();
    format!("label{s} {}", names.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::NewMeeting;

    fn meeting(db: &Database) -> String {
        db.create_meeting(NewMeeting {
            title: "Interview".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap()
        .id
    }

    #[test]
    fn replies_lose_their_action_blocks() {
        let raw = "Done, added them.\n\n```nootle-actions\n[{\"action\": \"add_to_notes\", \"markdown\": \"- one\"}, {\"action\": \"add_labels\", \"labels\": [\"Hiring\"]}]\n```\n";
        let (text, actions) = split_actions(raw);
        assert_eq!(text, "Done, added them.");
        let actions: Vec<_> = actions.into_iter().map(Result::unwrap).collect();
        assert_eq!(
            actions,
            [
                ChatAction::AddToNotes {
                    markdown: "- one".into()
                },
                ChatAction::AddLabels {
                    labels: vec!["Hiring".into()]
                },
            ]
        );
    }

    #[test]
    fn plain_replies_ask_for_nothing() {
        let (text, actions) = split_actions("She asked about visas at 04:12.");
        assert_eq!(text, "She asked about visas at 04:12.");
        assert!(actions.is_empty());
    }

    #[test]
    fn unreadable_and_unknown_changes_are_reported() {
        let (_, actions) = split_actions("```nootle-actions\nnot json\n```");
        assert!(actions[0].is_err());
        let (_, actions) = split_actions(
            "```nootle-actions\n[{\"action\": \"delete_meeting\"}, {\"action\": \"rename_meeting\", \"title\": \"Sync\"}]\n```",
        );
        assert!(actions[0]
            .as_ref()
            .unwrap_err()
            .to_string()
            .contains("delete_meeting"));
        assert!(actions[1].is_ok());
    }

    #[tokio::test]
    async fn changes_apply_to_the_meeting_and_name_their_events() {
        let db = Database::new_in_memory().unwrap();
        let llm = LlmRegistry::new();
        let id = meeting(&db);
        let act = |action| async { run(&db, &llm, &mut None, &id, action, "none", "none").await };

        let done = act(ChatAction::AddLabels {
            labels: vec!["Hiring".into()],
        })
        .await
        .unwrap();
        assert_eq!(
            (done.summary.as_str(), done.events, done.url),
            ("Added label Hiring", LABELS, None)
        );
        assert_eq!(db.get_meeting_labels(&id).unwrap()[0].name, "Hiring");

        let done = act(ChatAction::AddActionItem {
            task: "Email Dena".into(),
            assignee: Some("".into()),
            due_date: None,
        })
        .await
        .unwrap();
        assert_eq!(done.events, INSIGHTS);
        let item = &db.get_insights_for_meeting(&id).unwrap()[0];
        assert_eq!(
            (item.content.as_str(), item.assignee.as_deref()),
            ("Email Dena", None)
        );

        let bad_date = act(ChatAction::AddActionItem {
            task: "Later".into(),
            assignee: None,
            due_date: Some("next week".into()),
        });
        assert!(bad_date.await.is_err());
        let bad_time = act(ChatAction::AddComment {
            at: "1:75".into(),
            text: "x".into(),
        });
        assert!(bad_time.await.is_err());
    }

    #[test]
    fn linear_is_offered_only_when_connected_and_allowed() {
        let db = Database::new_in_memory().unwrap();
        let offers = |db: &Database| actions_guide(db).contains("create_linear_issue");
        assert!(!offers(&db));
        assert!(actions_guide(&db).contains(NO_SENDING));

        db.set_linear_setting("api_key", "lin_api_x").unwrap();
        assert!(offers(&db));
        assert!(!actions_guide(&db).contains(NO_SENDING));

        db.set_setting(crate::llm::LOCAL_ONLY_SETTING, "true")
            .unwrap();
        assert!(!offers(&db));
    }

    fn notion_workflow(db: &Database, config: &str) {
        let notion = db.create_integration("notion", "Wiki", "{}").unwrap();
        db.create_workflow("Notes", None, None, &notion.id, "create_page", config)
            .unwrap();
    }

    #[test]
    fn notion_is_offered_only_with_a_database_to_write_to() {
        let db = Database::new_in_memory().unwrap();
        let offers = |db: &Database| actions_guide(db).contains("create_notion_page");
        notion_workflow(&db, "{}");
        assert!(!offers(&db));

        notion_workflow(&db, r#"{"database_id": " db-1 "}"#);
        assert!(offers(&db));
        assert_eq!(Wiki::Notion.target(&db).unwrap().1, "db-1");
        assert!(actions_guide(&db).contains(ONLY_WHAT_WAS_ASKED));
        assert!(!actions_guide(&db).contains("create_linear_issue"));

        db.set_setting(crate::llm::LOCAL_ONLY_SETTING, "true")
            .unwrap();
        assert!(!offers(&db));
    }

    #[test]
    fn confluence_is_offered_with_a_space_to_write_to() {
        let db = Database::new_in_memory().unwrap();
        let offers = |db: &Database| actions_guide(db).contains("create_confluence_page");
        assert!(!offers(&db));
        let wiki = db.create_integration("confluence", "Wiki", "{}").unwrap();
        db.create_workflow(
            "Notes",
            None,
            None,
            &wiki.id,
            "create_page",
            r#"{"space_key": "ENG"}"#,
        )
        .unwrap();
        assert!(offers(&db));
        assert!(!actions_guide(&db).contains("create_notion_page"));

        let (_, actions) = split_actions(
            "```nootle-actions\n{\"action\": \"create_confluence_page\", \"title\": \"Decisions\", \"markdown\": \"## Decisions\"}\n```",
        );
        assert_eq!(
            actions[0].as_ref().unwrap(),
            &ChatAction::CreateConfluencePage {
                title: "Decisions".into(),
                markdown: "## Decisions".into(),
            }
        );
    }

    #[tokio::test]
    async fn notion_pages_parse_and_need_a_title_and_a_database() {
        let (_, actions) = split_actions(
            "```nootle-actions\n[{\"action\": \"create_notion_page\", \"title\": \"Onboarding decisions\", \"markdown\": \"- Ship inline permissions\"}]\n```",
        );
        assert_eq!(
            actions[0].as_ref().unwrap(),
            &ChatAction::CreateNotionPage {
                title: "Onboarding decisions".into(),
                markdown: "- Ship inline permissions".into(),
            }
        );

        let db = Database::new_in_memory().unwrap();
        let id = meeting(&db);
        let untitled = create_wiki_page(&db, &id, Wiki::Notion, " ", "x").await;
        assert!(untitled.unwrap_err().to_string().contains("no title"));
        let nowhere = create_wiki_page(&db, &id, Wiki::Notion, "Decisions", "x").await;
        assert!(nowhere.unwrap_err().to_string().contains("Notion workflow"));
    }

    #[tokio::test]
    async fn linear_issues_parse_and_respect_local_only() {
        let (_, actions) = split_actions(
            "```nootle-actions\n[{\"action\": \"create_linear_issue\", \"title\": \"Write the explainer copy\", \"description\": \"Two variants\"}]\n```",
        );
        assert_eq!(
            actions[0].as_ref().unwrap(),
            &ChatAction::CreateLinearIssue {
                title: "Write the explainer copy".into(),
                description: Some("Two variants".into()),
            }
        );

        let db = Database::new_in_memory().unwrap();
        let id = meeting(&db);
        let empty = create_linear_issue(&db, &mut None, &id, "  ", None).await;
        assert!(empty.unwrap_err().to_string().contains("no title"));
        db.set_setting(crate::llm::LOCAL_ONLY_SETTING, "true")
            .unwrap();
        let blocked =
            create_linear_issue(&db, &mut None, &id, "Write the explainer copy", None).await;
        assert!(blocked.unwrap_err().to_string().contains("Local-only"));
    }
}
