use crate::db::{Database, InsightType, NewActionItem, NewInsight};
use crate::llm::{ChatMessage, LlmRegistry};
use std::collections::HashMap;

fn build_extraction_prompt(types: &[InsightType]) -> String {
    let mut schema_parts = Vec::new();
    for t in types {
        if t.has_action_fields {
            schema_parts.push(format!(
                r#"  "{}": [
    {{ "content": "what needs to be done", "assignee": "person name or null", "due_date": "YYYY-MM-DD or null", "context": "brief context", "timestamp_ms": 12345 }}
  ]"#,
                t.slug
            ));
        } else {
            schema_parts.push(format!(
                r#"  "{}": [
    {{ "content": "concise text", "context": "brief surrounding context", "timestamp_ms": 12345 }}
  ]"#,
                t.slug
            ));
        }
    }

    let mut type_instructions = Vec::new();
    for t in types {
        type_instructions.push(format!("- {}: {}", t.slug, t.extraction_prompt));
    }

    format!(
        r#"You are a meeting intelligence assistant. Analyze the meeting transcript and extract structured insights.

Return ONLY a JSON object with exactly this schema (no markdown, no extra text):
{{
{schema}
}}

Types to extract:
{instructions}

Rules:
- timestamp_ms should match the approximate start time from the transcript timestamps
- assignee should be a person's name if mentioned, otherwise null
- due_date should be ISO format (YYYY-MM-DD) if a date is mentioned, otherwise null
- Return empty arrays if no items of that type are found
- Be concise: each content field should be 1-2 sentences max
- Only extract items that are clearly stated, not implied"#,
        schema = schema_parts.join(",\n"),
        instructions = type_instructions.join("\n"),
    )
}

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

pub fn strip_code_fences_pub(s: &str) -> &str {
    strip_code_fences(s)
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

fn parse_extraction_response(
    json_str: &str,
    types: &[InsightType],
) -> anyhow::Result<HashMap<String, Vec<serde_json::Value>>> {
    let value: serde_json::Value = serde_json::from_str(json_str)?;
    let obj = value
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("Expected JSON object"))?;

    let mut result = HashMap::new();
    for t in types {
        if let Some(arr) = obj.get(&t.slug).and_then(|v| v.as_array()) {
            result.insert(t.slug.clone(), arr.clone());
        } else {
            result.insert(t.slug.clone(), Vec::new());
        }
    }
    Ok(result)
}

pub async fn extract_insights(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<()> {
    let transcript_text = format_transcript(db, meeting_id)?;
    let types = db.list_insight_types()?;
    if types.is_empty() {
        anyhow::bail!("No insight types configured");
    }
    let run = db.create_extraction_run(meeting_id, provider_name, model)?;

    let system_prompt = build_extraction_prompt(&types);
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system_prompt,
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
    let extracted = match parse_extraction_response(cleaned, &types) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse extraction response: {e}\nRaw: {response}");
            let _ = db.update_extraction_run_status(&run.id, "failed");
            anyhow::bail!("Failed to parse extraction response: {e}");
        }
    };

    for t in &types {
        let items = match extracted.get(&t.slug) {
            Some(items) => items,
            None => continue,
        };

        for item in items {
            let content = item
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if content.is_empty() {
                continue;
            }
            let context = item
                .get("context")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let timestamp_ms = item.get("timestamp_ms").and_then(|v| v.as_i64());

            let insight = db.create_insight(NewInsight {
                meeting_id: meeting_id.to_string(),
                insight_type: t.slug.clone(),
                content,
                context,
                transcript_start_ms: timestamp_ms,
                transcript_end_ms: None,
            })?;

            if t.has_action_fields {
                let assignee = item
                    .get("assignee")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let due_date = item
                    .get("due_date")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                db.create_action_item(NewActionItem {
                    insight_id: insight.id,
                    assignee,
                    due_date,
                })?;
            }
        }
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
