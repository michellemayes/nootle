use crate::db::{Database, NewActionItem, NewInsight};
use crate::llm::{ChatMessage, LlmRegistry};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ExtractionResponse {
    #[serde(default)]
    decisions: Vec<ExtractedItem>,
    #[serde(default)]
    action_items: Vec<ExtractedActionItem>,
    #[serde(default)]
    key_moments: Vec<ExtractedItem>,
}

#[derive(Debug, Deserialize)]
struct ExtractedItem {
    content: String,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    timestamp_ms: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ExtractedActionItem {
    content: String,
    #[serde(default)]
    assignee: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    timestamp_ms: Option<i64>,
}

const EXTRACTION_PROMPT: &str = r#"You are a meeting intelligence assistant. Analyze the meeting transcript and extract structured insights.

Return ONLY a JSON object with exactly this schema (no markdown, no extra text):
{
  "decisions": [
    { "content": "concise decision text", "context": "brief surrounding context", "timestamp_ms": 12345 }
  ],
  "action_items": [
    { "content": "what needs to be done", "assignee": "person name or null", "due_date": "YYYY-MM-DD or null", "context": "brief context", "timestamp_ms": 12345 }
  ],
  "key_moments": [
    { "content": "important moment description", "context": "brief context", "timestamp_ms": 12345 }
  ]
}

Rules:
- timestamp_ms should match the approximate start time from the transcript timestamps
- assignee should be a person's name if mentioned, otherwise null
- due_date should be ISO format (YYYY-MM-DD) if a date is mentioned, otherwise null
- Return empty arrays if no items of that type are found
- Be concise: each content field should be 1-2 sentences max
- Only extract items that are clearly stated, not implied"#;

fn format_transcript(db: &Database, meeting_id: &str) -> anyhow::Result<String> {
    let transcript = db.get_transcript(meeting_id)?;
    if transcript.is_empty() {
        anyhow::bail!("No transcript found for meeting {}", meeting_id);
    }
    Ok(transcript
        .iter()
        .map(|s| {
            let total_seconds = s.start_ms / 1000;
            let minutes = total_seconds / 60;
            let seconds = total_seconds % 60;
            format!(
                "[{:02}:{:02}] {}: {}",
                minutes, seconds, s.speaker_label, s.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

fn strip_code_fences(s: &str) -> &str {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.strip_suffix("```").unwrap_or(rest).trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.strip_suffix("```").unwrap_or(rest).trim()
    } else {
        trimmed
    }
}

pub async fn extract_insights(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<()> {
    let transcript_text = format_transcript(db, meeting_id)?;
    let run = db.create_extraction_run(meeting_id, provider_name, model)?;

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: EXTRACTION_PROMPT.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!("Here is the meeting transcript:\n\n{}", transcript_text),
        },
    ];

    let provider = llm
        .get_provider(provider_name)
        .ok_or_else(|| anyhow::anyhow!("Provider '{}' not found", provider_name))?;

    let response = match provider.chat(messages, model).await {
        Ok(r) => r,
        Err(e) => {
            let _ = db.update_extraction_run_status(&run.id, "failed");
            return Err(e);
        }
    };

    let cleaned = strip_code_fences(&response);
    let extracted: ExtractionResponse = match serde_json::from_str(cleaned) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse extraction response: {e}\nRaw: {response}");
            let _ = db.update_extraction_run_status(&run.id, "failed");
            anyhow::bail!("Failed to parse extraction response: {e}");
        }
    };

    for item in &extracted.decisions {
        db.create_insight(NewInsight {
            meeting_id: meeting_id.to_string(),
            insight_type: "decision".to_string(),
            content: item.content.clone(),
            context: item.context.clone(),
            transcript_start_ms: item.timestamp_ms,
            transcript_end_ms: None,
        })?;
    }

    for item in &extracted.key_moments {
        db.create_insight(NewInsight {
            meeting_id: meeting_id.to_string(),
            insight_type: "key_moment".to_string(),
            content: item.content.clone(),
            context: item.context.clone(),
            transcript_start_ms: item.timestamp_ms,
            transcript_end_ms: None,
        })?;
    }

    for item in &extracted.action_items {
        let insight = db.create_insight(NewInsight {
            meeting_id: meeting_id.to_string(),
            insight_type: "action_item".to_string(),
            content: item.content.clone(),
            context: item.context.clone(),
            transcript_start_ms: item.timestamp_ms,
            transcript_end_ms: None,
        })?;
        db.create_action_item(NewActionItem {
            insight_id: insight.id,
            assignee: item.assignee.clone(),
            due_date: item.due_date.clone(),
        })?;
    }

    db.update_extraction_run_status(&run.id, "completed")?;
    Ok(())
}

pub async fn re_extract_insights(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<()> {
    db.delete_insights_for_meeting(meeting_id)?;
    extract_insights(db, llm, meeting_id, provider_name, model).await
}
