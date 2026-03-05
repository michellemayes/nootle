use crate::db::{Database, NewSummary, Summary};
use crate::llm::{ChatMessage, LlmRegistry};

pub async fn summarize_meeting(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    prompt_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<Summary> {
    // Get transcript
    let transcript = db.get_transcript(meeting_id)?;
    if transcript.is_empty() {
        anyhow::bail!("No transcript found for meeting {}", meeting_id);
    }

    // Get prompt
    let prompt = db.get_prompt(prompt_id)?;

    // Format transcript as text
    let transcript_text = transcript
        .iter()
        .map(|s| {
            format!(
                "[{}] {}: {}",
                format_ms(s.start_ms),
                s.speaker_label,
                s.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Fetch scratch notes and format them if present
    let scratch_notes = db.get_scratch_notes(meeting_id).unwrap_or_default();
    let notes_section = if scratch_notes.is_empty() {
        String::new()
    } else {
        let formatted: Vec<String> = scratch_notes
            .iter()
            .map(|n| format!("- [{}] \"{}\"", format_ms(n.timestamp_ms), n.content))
            .collect();
        format!(
            "\n\nThe user highlighted these moments during the meeting:\n{}\n\nGive extra attention to these highlighted topics in your summary.",
            formatted.join("\n")
        )
    };

    // Build messages
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: prompt.content,
        },
        ChatMessage {
            role: "user".into(),
            content: format!(
                "Here is the meeting transcript:\n\n{}{}",
                transcript_text, notes_section
            ),
        },
    ];

    // Call LLM
    let provider = llm
        .get_provider(provider_name)
        .ok_or_else(|| anyhow::anyhow!("Provider '{}' not found", provider_name))?;
    let content = provider.chat(messages, model).await?;

    // Save summary to DB
    let summary = db.create_summary(NewSummary {
        meeting_id: meeting_id.to_string(),
        prompt_id: Some(prompt_id.to_string()),
        provider: provider_name.to_string(),
        model: model.to_string(),
        content,
    })?;

    Ok(summary)
}

pub async fn run_auto_prompts(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<Vec<Summary>> {
    let prompts = db.get_auto_run_prompts()?;
    let mut summaries = Vec::new();
    for prompt in prompts {
        match summarize_meeting(db, llm, meeting_id, &prompt.id, provider_name, model).await {
            Ok(summary) => summaries.push(summary),
            Err(e) => tracing::error!("Auto-prompt '{}' failed: {}", prompt.name, e),
        }
    }
    Ok(summaries)
}

pub async fn chat_with_transcript(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    user_message: &str,
    conversation_history: Vec<ChatMessage>,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<String> {
    // Get transcript
    let transcript = db.get_transcript(meeting_id)?;
    let transcript_text = transcript
        .iter()
        .map(|s| {
            format!(
                "[{}] {}: {}",
                format_ms(s.start_ms),
                s.speaker_label,
                s.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Build messages with transcript as system context
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: format!(
            "You are a helpful assistant that answers questions about a meeting transcript. \
             Here is the full transcript:\n\n{}\n\n\
             Answer the user's questions based on this transcript. \
             Be concise and reference specific parts of the conversation when relevant.",
            transcript_text
        ),
    }];

    // Add conversation history
    messages.extend(conversation_history);

    // Add the new user message
    messages.push(ChatMessage {
        role: "user".into(),
        content: user_message.to_string(),
    });

    // Call LLM
    let provider = llm
        .get_provider(provider_name)
        .ok_or_else(|| anyhow::anyhow!("Provider '{}' not found", provider_name))?;
    provider.chat(messages, model).await
}

pub fn format_ms(ms: i64) -> String {
    let total_seconds = ms / 1000;
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("{:02}:{:02}", minutes, seconds)
}
