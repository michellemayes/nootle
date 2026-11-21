//! Live Assist playbook: a checklist of topics to cover in a call (a
//! discovery call's budget and timeline, say), ticked off as the
//! conversation gets to them.

use crate::analytics::extract_json_array;
use crate::commitments::topic_words;
use crate::db::Database;
use crate::llm::{ChatMessage, LlmRegistry};
use anyhow::Result;

use std::collections::HashSet;

/// Minutes of the live conversation the model checks the items against.
/// The model looks about once a minute, so lines overlap one check.
const RECENT_MINUTES: i64 = 2;

/// Whether every topic word of `item` is among `heard`, the topic words of
/// what was said. Items without one ("Q&A") never match this way.
fn said(item: &str, heard: &HashSet<String>) -> bool {
    let keys = topic_words(item);
    !keys.is_empty() && keys.is_subset(heard)
}

/// The numbers in a reply like `[1, 3]`, as indexes into `count` items.
fn parse_indexes(reply: &str, count: usize) -> Vec<usize> {
    let mut found: Vec<usize> = serde_json::from_str::<Vec<usize>>(extract_json_array(reply))
        .unwrap_or_default()
        .into_iter()
        .filter(|n| (1..=count).contains(n))
        .map(|n| n - 1)
        .collect();
    found.sort_unstable();
    found.dedup();
    found
}

/// Which of `items` the meeting so far has covered, as indexes into
/// `items`. Items whose key words were all said count without asking the
/// model; the model judges the rest against the last few minutes. Without
/// `llm`, only the first check runs.
pub async fn coverage(
    db: &Database,
    llm: Option<(&LlmRegistry, &str, &str)>,
    meeting_id: &str,
    items: &[String],
) -> Result<Vec<usize>> {
    let transcript = db.get_transcript(meeting_id)?;
    if transcript.is_empty() {
        return Ok(Vec::new());
    }
    let heard: HashSet<String> = transcript
        .iter()
        .flat_map(|s| topic_words(&s.text))
        .collect();
    let (mut covered, open): (Vec<usize>, Vec<usize>) =
        (0..items.len()).partition(|&i| said(&items[i], &heard));
    if open.is_empty() {
        return Ok(covered);
    }

    if let Some((llm, provider, model)) = llm {
        let recent = crate::ops::recent_transcript(&transcript, RECENT_MINUTES);
        let list = open
            .iter()
            .enumerate()
            .map(|(n, &i)| format!("{}. {}", n + 1, items[i]))
            .collect::<Vec<_>>()
            .join("\n");
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "You track a meeting against a checklist of topics. From the \
                          transcript below, list the numbers of the topics the conversation \
                          has actually discussed, not just mentioned in passing, as a JSON \
                          array such as [1, 3]. Reply [] if none were."
                    .into(),
            },
            ChatMessage {
                role: "user".into(),
                content: format!(
                    "TOPICS:\n{list}\n\nTRANSCRIPT:\n{}",
                    crate::summarization::format_transcript(&recent)
                ),
            },
        ];
        let reply = crate::ops::chat(llm, provider, model, messages).await?;
        covered.extend(
            parse_indexes(&reply, open.len())
                .into_iter()
                .map(|n| open[n]),
        );
        covered.sort_unstable();
    }
    Ok(covered)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewMeeting, NewTranscriptSegment};

    #[test]
    fn matches_when_every_key_word_was_said() {
        let heard = |text: &str| topic_words(text);
        assert!(said("Budget", &heard("So what's the budget for this?")));
        assert!(said(
            "Decision makers",
            &heard("Who else is in the decision? The makers of the call.")
        ));
        assert!(said(
            "Timeline",
            &heard("What timelines are you working to")
        ));
        assert!(!said("Decision makers", &heard("We decided to wait.")));
        assert!(!said("Q&A", &heard("Any questions and answers?")));
    }

    #[test]
    fn parses_the_models_numbers() {
        assert_eq!(parse_indexes("[2, 1, 2]", 3), vec![0, 1]);
        assert_eq!(parse_indexes("Covered: [3]", 3), vec![2]);
        assert_eq!(parse_indexes("[]", 3), Vec::<usize>::new());
        assert_eq!(parse_indexes("[0, 4, 9]", 3), Vec::<usize>::new());
        assert_eq!(parse_indexes("[1, \"two\"]", 3), Vec::<usize>::new());
        assert_eq!(parse_indexes("none", 3), Vec::<usize>::new());
    }

    #[tokio::test]
    async fn covers_items_said_in_the_meeting_without_a_model() {
        let db = Database::new_in_memory().unwrap();
        let m = db
            .create_meeting(NewMeeting {
                title: "Discovery".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        let items = vec!["Budget".to_string(), "Timeline".to_string()];
        assert!(coverage(&db, None, &m.id, &items).await.unwrap().is_empty());

        db.create_transcript_segment(NewTranscriptSegment {
            meeting_id: m.id.clone(),
            speaker_label: "You".into(),
            text: "What timeline are you working to?".into(),
            start_ms: 0,
            end_ms: 2_000,
            confidence: 0.9,
        })
        .unwrap();
        assert_eq!(coverage(&db, None, &m.id, &items).await.unwrap(), vec![1]);
    }
}
