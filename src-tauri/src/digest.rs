//! Daily digest: one look at a day of meetings. What you met about and
//! decided, the action items those meetings produced, what's due, and an
//! optional short recap from the AI.

use std::collections::HashSet;

use crate::brief::{decisions_or_excerpt, BriefItem};
use crate::db::{Database, InsightWithActionItem};
use crate::llm::LlmRegistry;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

const MAX_DECISIONS: usize = 3;
const MAX_ITEMS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DailyDigest {
    /// Oldest first, the order the day happened in.
    pub meetings: Vec<DigestMeeting>,
    /// Open action items from the day's meetings.
    pub new_items: Vec<BriefItem>,
    /// Other open action items due by the end of the day, overdue included.
    pub due_items: Vec<BriefItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DigestMeeting {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub minutes: i64,
    pub decisions: Vec<String>,
    /// The start of its summary, for meetings without extracted decisions.
    pub summary: Option<String>,
}

/// Local midnight at the start of `date` and of the day after, in UTC.
fn local_day(date: NaiveDate) -> Result<(DateTime<Utc>, DateTime<Utc>)> {
    let midnight = |d: NaiveDate| {
        d.and_hms_opt(0, 0, 0)
            .and_then(|t| t.and_local_timezone(Local).earliest())
            .map(|t| t.with_timezone(&Utc))
            .ok_or_else(|| anyhow!("No local midnight on {d}"))
    };
    let next = date
        .succ_opt()
        .ok_or_else(|| anyhow!("No day after {date}"))?;
    Ok((midnight(date)?, midnight(next)?))
}

fn top(items: Vec<InsightWithActionItem>) -> Vec<BriefItem> {
    items
        .into_iter()
        .take(MAX_ITEMS)
        .map(BriefItem::from)
        .collect()
}

/// `YYYY-MM-DD` as a date, or today in local time when `date` is `None`.
pub fn parse_date(date: Option<&str>) -> Result<NaiveDate> {
    match date {
        Some(d) => NaiveDate::parse_from_str(d, "%Y-%m-%d")
            .map_err(|e| anyhow!("Expected a date like 2026-11-20: {e}")),
        None => Ok(Local::now().date_naive()),
    }
}

/// The digest of the meetings started on `date`, a day in local time.
pub fn build(db: &Database, date: NaiveDate) -> Result<DailyDigest> {
    let (since, until) = local_day(date)?;
    let mut day: Vec<_> = db
        .list_meetings(None, false, None)?
        .into_iter()
        .filter(|m| m.status != "recording")
        .filter_map(|m| {
            let start = crate::calendar::parse(&m.start_time)?;
            (start >= since && start < until).then_some((start, m))
        })
        .collect();
    day.sort_by_key(|(start, _)| *start);

    let mut meetings = Vec::with_capacity(day.len());
    for (start, m) in day {
        let (decisions, summary) = decisions_or_excerpt(db, &m.id, MAX_DECISIONS)?;
        let minutes = m
            .end_time
            .as_deref()
            .and_then(crate::calendar::parse)
            .map_or(0, |end| (end - start).num_minutes().max(0));
        meetings.push(DigestMeeting {
            id: m.id,
            title: m.title,
            start_time: m.start_time,
            minutes,
            decisions,
            summary,
        });
    }

    // Due dates are kept as `YYYY-MM-DD`, so they compare as strings.
    let due_by = date.format("%Y-%m-%d").to_string();
    let ids: HashSet<&str> = meetings.iter().map(|m| m.id.as_str()).collect();
    let (new_items, others): (Vec<_>, Vec<_>) = db
        .get_all_insights(None, Some("action_item"), Some("open"), None)?
        .into_iter()
        .partition(|i| ids.contains(i.meeting_id.as_str()));
    let mut due: Vec<_> = others
        .into_iter()
        .filter(|i| i.due_date.as_deref().is_some_and(|d| d <= due_by.as_str()))
        .collect();
    due.sort_by(|a, b| a.due_date.cmp(&b.due_date));

    Ok(DailyDigest {
        meetings,
        new_items: top(new_items),
        due_items: top(due),
    })
}

/// The digest as text for the model.
fn prompt_context(digest: &DailyDigest) -> String {
    let mut out = String::new();
    for m in &digest.meetings {
        out.push_str(&format!("Meeting \"{}\" ({} min)", m.title, m.minutes));
        for d in &m.decisions {
            out.push_str(&format!("\n- Decided: {d}"));
        }
        if let Some(summary) = &m.summary {
            out.push_str(&format!("\n{summary}"));
        }
        out.push('\n');
    }
    for (heading, items) in [
        ("New action items:", &digest.new_items),
        ("Due or overdue:", &digest.due_items),
    ] {
        if items.is_empty() {
            continue;
        }
        out.push_str(heading);
        for item in items {
            let owner = item.assignee.as_deref().unwrap_or("unassigned");
            let due = item
                .due_date
                .as_deref()
                .map(|d| format!(", due {d}"))
                .unwrap_or_default();
            out.push_str(&format!("\n- {} ({owner}{due})", item.content));
        }
        out.push('\n');
    }
    out
}

/// Three or four sentences on `date`, from the model automatic work uses.
/// `None` without meetings that day or a model (in Local-only mode, a local
/// one).
pub async fn synthesize(
    db: &Database,
    llm: &LlmRegistry,
    date: NaiveDate,
) -> Result<Option<String>> {
    let digest = build(db, date)?;
    if digest.meetings.is_empty() {
        return Ok(None);
    }
    crate::ops::auto_reply(
        db,
        llm,
        "You recap someone's day of meetings for them. From the digest below, say in three or \
         four short sentences what happened, what was decided, and what they should follow up \
         on next. Be specific and use names; no preamble, no bullets.",
        prompt_context(&digest),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewActionItem, NewInsight, NewMeeting, NewSummary};

    fn meeting(db: &Database, title: &str) -> String {
        let m = db
            .create_meeting(NewMeeting {
                title: title.into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        db.update_meeting_status(&m.id, "summarized").unwrap();
        m.id
    }

    fn insight(db: &Database, meeting_id: &str, kind: &str, content: &str, due: Option<&str>) {
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
                assignee: Some("Ana".into()),
                due_date: due.map(str::to_string),
            })
            .unwrap();
        }
    }

    fn today() -> NaiveDate {
        Local::now().date_naive()
    }

    #[test]
    fn collects_the_days_meetings_items_and_due_dates() {
        let db = Database::new_in_memory().unwrap();
        let sync = meeting(&db, "Sync");
        insight(&db, &sync, "decision", "Ship Friday", None);
        insight(&db, &sync, "action_item", "Write the FAQ", None);
        let roadmap = meeting(&db, "Roadmap");
        db.create_summary(NewSummary {
            meeting_id: roadmap.clone(),
            template_id: None,
            provider: "ollama".into(),
            model: "m".into(),
            content: "## Summary\n- The **beta** slips a week.\n".into(),
        })
        .unwrap();

        let digest = build(&db, today()).unwrap();
        let titles: Vec<&str> = digest.meetings.iter().map(|m| m.title.as_str()).collect();
        assert_eq!(titles, vec!["Sync", "Roadmap"]);
        assert_eq!(digest.meetings[0].decisions, vec!["Ship Friday"]);
        assert_eq!(
            digest.meetings[1].summary.as_deref(),
            Some("The beta slips a week.")
        );
        assert_eq!(digest.new_items.len(), 1);
        assert_eq!(digest.new_items[0].content, "Write the FAQ");
        assert!(digest.due_items.is_empty());
    }

    #[test]
    fn due_items_come_from_other_days_sorted_by_date() {
        let db = Database::new_in_memory().unwrap();
        let day = today() - chrono::Days::new(3);
        let date = |offset: i64| {
            (day + chrono::Duration::days(offset))
                .format("%Y-%m-%d")
                .to_string()
        };
        let old = meeting(&db, "Planning");
        insight(&db, &old, "action_item", "Due that day", Some(&date(0)));
        insight(&db, &old, "action_item", "Overdue", Some(&date(-9)));
        insight(&db, &old, "action_item", "Next week", Some(&date(7)));
        insight(&db, &old, "action_item", "Someday", None);

        let digest = build(&db, day).unwrap();
        assert!(digest.meetings.is_empty());
        assert!(digest.new_items.is_empty());
        let due: Vec<&str> = digest
            .due_items
            .iter()
            .map(|i| i.content.as_str())
            .collect();
        assert_eq!(due, vec!["Overdue", "Due that day"]);
    }

    #[test]
    fn an_empty_day_is_empty() {
        let db = Database::new_in_memory().unwrap();
        let digest = build(&db, today()).unwrap();
        assert!(
            digest.meetings.is_empty()
                && digest.new_items.is_empty()
                && digest.due_items.is_empty()
        );
    }

    #[test]
    fn parses_dates_and_defaults_to_today() {
        assert_eq!(
            parse_date(Some("2026-11-20")).unwrap(),
            NaiveDate::from_ymd_opt(2026, 11, 20).unwrap()
        );
        assert_eq!(parse_date(None).unwrap(), today());
        assert!(parse_date(Some("yesterday")).is_err());
    }

    #[test]
    fn prompt_carries_the_day() {
        let db = Database::new_in_memory().unwrap();
        let id = meeting(&db, "Sync");
        insight(&db, &id, "decision", "Ship Friday", None);
        insight(&db, &id, "action_item", "Write notes", Some("2026-11-20"));
        let prompt = prompt_context(&build(&db, today()).unwrap());
        assert!(prompt.contains("Meeting \"Sync\""));
        assert!(prompt.contains("- Decided: Ship Friday"));
        assert!(prompt.contains("- Write notes (Ana, due 2026-11-20)"));
    }
}
