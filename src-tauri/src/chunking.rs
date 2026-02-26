//! Transcript chunking and embedding pipeline.

use crate::db::{Database, TranscriptChunk};
use crate::embedding::EmbeddingEngine;
use anyhow::Context;

const TARGET_CHUNK_TOKENS: usize = 500;
const OVERLAP_TOKENS: usize = 50;

fn token_count(text: &str) -> usize {
    text.split_whitespace().count()
}

pub fn chunk_segments(
    segments: &[crate::db::TranscriptSegment],
) -> Vec<(String, i64, i64, String)> {
    if segments.is_empty() {
        return vec![];
    }

    let mut chunks = Vec::new();
    let mut current_text = String::new();
    let mut current_tokens = 0usize;
    let mut chunk_start_ms = segments[0].start_ms;
    let mut chunk_end_ms = segments[0].end_ms;
    let mut speakers: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut overlap_start_idx: usize = 0;

    for (i, seg) in segments.iter().enumerate() {
        let seg_text = format!("{}: {}", seg.speaker_label, seg.text);
        let seg_tokens = token_count(&seg_text);

        if current_tokens + seg_tokens > TARGET_CHUNK_TOKENS && current_tokens > 0 {
            let speaker_list: Vec<&str> = speakers.iter().map(|s| s.as_str()).collect();
            let speakers_json =
                serde_json::to_string(&speaker_list).unwrap_or_else(|_| "[]".to_string());
            chunks.push((
                current_text.clone(),
                chunk_start_ms,
                chunk_end_ms,
                speakers_json,
            ));

            current_text.clear();
            current_tokens = 0;
            speakers.clear();

            let mut overlap_tokens = 0;
            let mut j = i;
            while j > overlap_start_idx && overlap_tokens < OVERLAP_TOKENS {
                let prev = &segments[j - 1];
                overlap_tokens +=
                    token_count(&format!("{}: {}", prev.speaker_label, prev.text));
                j -= 1;
            }
            overlap_start_idx = i;

            for seg_idx in j..i {
                let s = &segments[seg_idx];
                let t = format!("{}: {}\n", s.speaker_label, s.text);
                current_tokens += token_count(&t);
                current_text.push_str(&t);
                speakers.insert(s.speaker_label.clone());
            }
            chunk_start_ms = if j < i {
                segments[j].start_ms
            } else {
                seg.start_ms
            };
        }

        current_text.push_str(&seg_text);
        current_text.push('\n');
        current_tokens += seg_tokens;
        chunk_end_ms = seg.end_ms;
        speakers.insert(seg.speaker_label.clone());
    }

    if current_tokens > 0 {
        let speaker_list: Vec<&str> = speakers.iter().map(|s| s.as_str()).collect();
        let speakers_json =
            serde_json::to_string(&speaker_list).unwrap_or_else(|_| "[]".to_string());
        chunks.push((current_text, chunk_start_ms, chunk_end_ms, speakers_json));
    }

    chunks
}

pub fn embed_meeting(
    db: &Database,
    engine: &mut EmbeddingEngine,
    meeting_id: &str,
) -> anyhow::Result<usize> {
    if db.has_meeting_chunks(meeting_id)? {
        return Ok(0);
    }

    let segments = db.get_transcript(meeting_id)?;
    if segments.is_empty() {
        return Ok(0);
    }

    let raw_chunks = chunk_segments(&segments);

    for (i, (text, start_ms, end_ms, speakers_json)) in raw_chunks.iter().enumerate() {
        let chunk_id = uuid::Uuid::new_v4().to_string();
        let chunk = TranscriptChunk {
            id: chunk_id.clone(),
            meeting_id: meeting_id.to_string(),
            chunk_index: i as i32,
            text: text.clone(),
            start_ms: *start_ms,
            end_ms: *end_ms,
            speaker_labels: speakers_json.clone(),
        };
        db.insert_chunk(&chunk)?;

        let embedding = engine.embed(text).context("Failed to embed chunk")?;
        db.insert_chunk_embedding(&chunk_id, &embedding)?;
    }

    Ok(raw_chunks.len())
}
