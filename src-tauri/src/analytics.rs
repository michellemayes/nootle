use crate::db::{Database, MeetingEngagement, SpeakerAnalytics};
use crate::llm::{ChatMessage, LlmRegistry};
use anyhow::Result;
use std::collections::HashMap;

use crate::db::SentimentSegment;

/// Compute talk-time analytics from transcript segments.
pub fn compute_speaker_analytics(
    db: &Database,
    meeting_id: &str,
) -> Result<Vec<SpeakerAnalytics>> {
    let transcripts = db.get_transcript(meeting_id)?;
    if transcripts.is_empty() {
        return Ok(vec![]);
    }

    // Group segments by speaker
    let mut speaker_segments: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    for seg in &transcripts {
        speaker_segments
            .entry(seg.speaker_label.clone())
            .or_default()
            .push((seg.start_ms, seg.end_ms));
    }

    for segments in speaker_segments.values_mut() {
        segments.sort_by_key(|s| s.0);
    }

    let mut results = Vec::new();
    for (speaker, segments) in &speaker_segments {
        let talk_time_ms: i64 = segments.iter().map(|(s, e)| e - s).sum();
        let turn_count = segments.len() as i64;
        let avg_turn_length_ms = if turn_count > 0 {
            talk_time_ms / turn_count
        } else {
            0
        };
        let longest_monologue_ms = segments.iter().map(|(s, e)| e - s).max().unwrap_or(0);

        results.push(SpeakerAnalytics {
            id: uuid::Uuid::new_v4().to_string(),
            meeting_id: meeting_id.to_string(),
            speaker_label: speaker.clone(),
            talk_time_ms,
            turn_count,
            interruption_count: 0,
            avg_turn_length_ms,
            longest_monologue_ms,
        });
    }

    // Compute interruptions: if a new speaker starts within 500ms of the previous
    // speaker's end, count it as an interruption by the new speaker.
    let mut all_segments: Vec<(&str, i64, i64)> = transcripts
        .iter()
        .map(|s| (s.speaker_label.as_str(), s.start_ms, s.end_ms))
        .collect();
    all_segments.sort_by_key(|s| s.1);

    let mut interruption_counts: HashMap<String, i64> = HashMap::new();
    for window in all_segments.windows(2) {
        let (prev_speaker, _, prev_end) = window[0];
        let (curr_speaker, curr_start, _) = window[1];
        if prev_speaker != curr_speaker && curr_start < prev_end + 500 {
            *interruption_counts
                .entry(curr_speaker.to_string())
                .or_default() += 1;
        }
    }

    for analytics in &mut results {
        analytics.interruption_count = interruption_counts
            .get(&analytics.speaker_label)
            .copied()
            .unwrap_or(0);
    }

    Ok(results)
}

/// Compute engagement metrics from speaker analytics and transcript texts.
///
/// The engagement score is a weighted combination of:
/// - Participation balance (40%): how evenly talk time is distributed
/// - Back-and-forth ratio (30%): how frequently speakers alternate
/// - Question density (30%): proportion of turns containing questions
pub fn compute_engagement(
    meeting_id: &str,
    speaker_analytics: &[SpeakerAnalytics],
    transcript_texts: &[String],
) -> MeetingEngagement {
    let total_time: f64 = speaker_analytics
        .iter()
        .map(|s| s.talk_time_ms as f64)
        .sum();
    let speaker_count = speaker_analytics.len() as f64;
    let ideal_share = if speaker_count > 0.0 {
        1.0 / speaker_count
    } else {
        1.0
    };

    let balance = if total_time > 0.0 && speaker_count > 1.0 {
        let variance: f64 = speaker_analytics
            .iter()
            .map(|s| {
                let share = s.talk_time_ms as f64 / total_time;
                (share - ideal_share).powi(2)
            })
            .sum::<f64>()
            / speaker_count;
        (1.0 - (variance * speaker_count).sqrt()).max(0.0)
    } else {
        0.5
    };

    let question_count = transcript_texts
        .iter()
        .filter(|t| t.contains('?'))
        .count() as i64;

    let total_turns: i64 = speaker_analytics.iter().map(|s| s.turn_count).sum();
    let back_and_forth = if total_turns > 1 {
        (total_turns as f64 - 1.0) / total_turns as f64
    } else {
        0.0
    };

    let score = (balance * 0.4)
        + (back_and_forth * 0.3)
        + ((question_count as f64 / total_turns.max(1) as f64).min(1.0) * 0.3);
    let level = if score > 0.65 {
        "high"
    } else if score > 0.35 {
        "medium"
    } else {
        "low"
    };

    MeetingEngagement {
        id: uuid::Uuid::new_v4().to_string(),
        meeting_id: meeting_id.to_string(),
        engagement_level: level.to_string(),
        participation_balance: balance,
        question_count,
        back_and_forth_ratio: back_and_forth,
    }
}

/// Analyze sentiment of transcript chunks using an LLM.
///
/// Groups transcript segments into ~30-second windows and asks the LLM to
/// classify each window as positive, neutral, or negative with a confidence
/// score. Windows that fail LLM classification are silently skipped.
pub async fn analyze_sentiment(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
) -> Result<Vec<SentimentSegment>> {
    let transcripts = db.get_transcript(meeting_id)?;
    if transcripts.is_empty() {
        return Ok(vec![]);
    }

    // Group into ~30-second windows
    let window_ms = 30_000;
    let mut windows: Vec<(i64, i64, String)> = Vec::new();
    let mut current_start = transcripts[0].start_ms;
    let mut current_texts: Vec<String> = Vec::new();
    let mut current_end = current_start;

    for seg in &transcripts {
        if seg.start_ms - current_start > window_ms && !current_texts.is_empty() {
            windows.push((current_start, current_end, current_texts.join(" ")));
            current_start = seg.start_ms;
            current_texts.clear();
        }
        current_texts.push(format!("{}: {}", seg.speaker_label, seg.text));
        current_end = seg.end_ms;
    }
    if !current_texts.is_empty() {
        windows.push((current_start, current_end, current_texts.join(" ")));
    }

    let llm_provider = llm
        .get_provider(provider)
        .ok_or_else(|| anyhow::anyhow!("LLM provider not found: {provider}"))?;

    let mut segments = Vec::new();
    for (start, end, text) in &windows {
        let prompt = format!(
            "Classify the sentiment of this meeting excerpt as exactly one of: positive, neutral, negative.\n\
             Also provide a confidence score from 0.0 to 1.0.\n\
             Respond ONLY with JSON: {{\"sentiment\": \"...\", \"score\": 0.0}}\n\n\
             Excerpt:\n{text}"
        );

        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }];

        match llm_provider.chat(messages, model).await {
            Ok(response) => {
                // Try to extract JSON from the response (the LLM may include markdown fences)
                let json_str = extract_json(&response);
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                    let sentiment =
                        parsed["sentiment"].as_str().unwrap_or("neutral").to_string();
                    let score = parsed["score"].as_f64().unwrap_or(0.5);
                    segments.push(SentimentSegment {
                        id: uuid::Uuid::new_v4().to_string(),
                        meeting_id: meeting_id.to_string(),
                        start_ms: *start,
                        end_ms: *end,
                        sentiment,
                        score,
                    });
                } else {
                    tracing::warn!(
                        "Failed to parse sentiment JSON for window {start}-{end}: {response}"
                    );
                }
            }
            Err(e) => {
                tracing::warn!("Sentiment analysis failed for window {start}-{end}: {e}");
            }
        }
    }

    Ok(segments)
}

/// Extract the first JSON object from a string, handling markdown code fences.
fn extract_json(s: &str) -> &str {
    let trimmed = s.trim();
    // Strip markdown fences if present
    if let Some(rest) = trimmed.strip_prefix("```json") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim();
        }
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim();
        }
    }
    // Try to find a JSON object directly
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            return &trimmed[start..=end];
        }
    }
    trimmed
}
