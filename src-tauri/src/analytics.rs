use crate::db::{Database, MeetingEngagement, SpeakerAnalytics};
use crate::llm::{ChatMessage, LlmRegistry};
use anyhow::Result;
use futures_util::StreamExt;
use std::collections::HashMap;

use crate::db::SentimentSegment;

/// Compute talk-time analytics from transcript segments.
pub fn compute_speaker_analytics(db: &Database, meeting_id: &str) -> Result<Vec<SpeakerAnalytics>> {
    let transcripts = db.get_transcript(meeting_id)?;
    if transcripts.is_empty() {
        return Ok(vec![]);
    }

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

    let question_count = transcript_texts.iter().filter(|t| t.contains('?')).count() as i64;

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

/// Max windows classified per LLM call. Keeps each prompt small enough for
/// fast, reliable responses while avoiding one CLI/API round-trip per window.
const SENTIMENT_WINDOWS_PER_CALL: usize = 40;
/// Batches in flight at once; CLI providers spawn a process per call.
const SENTIMENT_MAX_CONCURRENT_CALLS: usize = 3;

/// Analyze sentiment of transcript chunks using an LLM.
///
/// Groups transcript segments into ~30-second windows, then classifies them in
/// batches (one LLM call per batch, a few batches at a time) as positive,
/// neutral, or negative with a confidence score. Windows missing from a
/// response are skipped; if no window could be classified, an error is returned.
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

    let batches = windows.chunks(SENTIMENT_WINDOWS_PER_CALL).map(|batch| async move {
        let excerpts = batch
            .iter()
            .enumerate()
            .map(|(i, (_, _, text))| format!("[{i}] {text}"))
            .collect::<Vec<_>>()
            .join("\n\n");
        let prompt = format!(
            "Classify the sentiment of each numbered meeting excerpt below as exactly one of: positive, neutral, negative.\n\
             Also provide a confidence score from 0.0 to 1.0 for each.\n\
             Respond ONLY with a JSON array containing one object per excerpt, in order:\n\
             [{{\"index\": 0, \"sentiment\": \"...\", \"score\": 0.0}}, ...]\n\n\
             Excerpts:\n{excerpts}"
        );
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }];
        (batch, llm_provider.chat(messages, model).await)
    });

    let mut segments = Vec::new();
    let mut last_error = None;
    let results: Vec<_> = futures_util::stream::iter(batches)
        .buffer_unordered(SENTIMENT_MAX_CONCURRENT_CALLS)
        .collect()
        .await;
    for (batch, result) in results {
        let response = match result {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Sentiment analysis batch failed: {e}");
                last_error = Some(e.to_string());
                continue;
            }
        };
        let Some(items) = parse_sentiment_batch(&response) else {
            tracing::warn!("Failed to parse sentiment JSON: {response}");
            last_error = Some("Could not parse sentiment response from the model".into());
            continue;
        };
        for (i, sentiment, score) in items {
            let Some((start, end, _)) = batch.get(i) else {
                continue;
            };
            segments.push(SentimentSegment {
                id: uuid::Uuid::new_v4().to_string(),
                meeting_id: meeting_id.to_string(),
                start_ms: *start,
                end_ms: *end,
                sentiment,
                score,
            });
        }
    }

    if let (true, Some(e)) = (segments.is_empty(), last_error) {
        anyhow::bail!("Sentiment analysis failed: {e}");
    }
    segments.sort_by_key(|s| s.start_ms);
    Ok(segments)
}

/// Parse a batched sentiment response into `(index, sentiment, score)` tuples.
/// Items without an explicit `index` fall back to their array position.
fn parse_sentiment_batch(response: &str) -> Option<Vec<(usize, String, f64)>> {
    let parsed: serde_json::Value = serde_json::from_str(extract_json_array(response)).ok()?;
    let items = parsed.as_array()?;
    Some(
        items
            .iter()
            .enumerate()
            .map(|(pos, item)| {
                let index = item["index"].as_u64().map(|i| i as usize).unwrap_or(pos);
                let sentiment = match item["sentiment"].as_str() {
                    Some(s @ ("positive" | "neutral" | "negative")) => s.to_string(),
                    _ => "neutral".to_string(),
                };
                let score = item["score"].as_f64().unwrap_or(0.5);
                (index, sentiment, score)
            })
            .collect(),
    )
}

/// Extract the outermost JSON array from a string (ignores markdown fences/prose).
fn extract_json_array(s: &str) -> &str {
    let trimmed = s.trim();
    match (trimmed.find('['), trimmed.rfind(']')) {
        (Some(start), Some(end)) if start < end => &trimmed[start..=end],
        _ => trimmed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fenced_sentiment_array() {
        let resp = "```json\n[{\"index\": 1, \"sentiment\": \"negative\", \"score\": 0.9}, {\"sentiment\": \"weird\"}]\n```";
        let items = parse_sentiment_batch(resp).unwrap();
        assert_eq!(items[0], (1, "negative".to_string(), 0.9));
        assert_eq!(items[1], (1, "neutral".to_string(), 0.5));
    }

    #[test]
    fn rejects_non_array_response() {
        assert!(parse_sentiment_batch("I can't do that").is_none());
    }
}
