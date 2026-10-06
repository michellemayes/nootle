//! Custom dictionary: correct spellings for names and jargon the speech model
//! keeps getting wrong.
//!
//! Each entry is a correct `term` plus the `misheard` variants that should be
//! rewritten to it. Entries are applied to new transcript segments as they are
//! recorded, and the terms are handed to the LLM as a spelling reference.
//!
//! Auto-learning: when the user edits a transcript segment, the edit is diffed
//! word by word and short substitutions ("noodle" → "Nootle") become entries.
//!
//! Entries can also be imported from a VoiceInk dictionary export or settings
//! backup.

use crate::db::Database;
use crate::error::{NootleError, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Setting key that turns learning from transcript edits on or off.
pub const AUTO_LEARN_SETTING: &str = "dictionary_auto_learn";

/// The longest phrase (in words) a learned correction may span. Longer hunks
/// are rewrites, not misheard words.
const MAX_LEARNED_WORDS: usize = 4;

/// Words too common to learn a global rewrite for. Fixing "their" → "there"
/// in one sentence must not rewrite every future "their".
const COMMON_WORDS: &[&str] = &[
    "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "been",
    "but", "by", "can", "could", "did", "do", "does", "for", "from", "get", "go", "got", "had",
    "has", "have", "he", "her", "here", "him", "his", "how", "i", "if", "in", "into", "is", "it",
    "its", "it's", "just", "know", "like", "me", "more", "my", "no", "not", "now", "of", "off",
    "on", "one", "or", "our", "out", "she", "so", "some", "that", "the", "their", "them", "then",
    "there", "these", "they", "they're", "this", "those", "to", "too", "two", "up", "us", "was",
    "we", "well", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would",
    "yeah", "yes", "you", "your", "you're",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DictionaryEntry {
    pub id: String,
    pub term: String,
    pub misheard: Vec<String>,
    /// "manual", "learned" or "imported".
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LearnedCorrection {
    pub from: String,
    pub to: String,
}

/// Misheard variants compiled for matching, longest first.
pub struct Rules {
    variants: Vec<(Vec<char>, String)>,
}

impl Rules {
    pub fn new(entries: &[DictionaryEntry]) -> Self {
        Self::from_pairs(entries.iter().flat_map(|e| {
            e.misheard
                .iter()
                .map(move |m| (m.as_str(), e.term.as_str()))
        }))
    }

    pub fn from_corrections(corrections: &[LearnedCorrection]) -> Self {
        Self::from_pairs(corrections.iter().map(|c| (c.from.as_str(), c.to.as_str())))
    }

    fn from_pairs<'a>(pairs: impl Iterator<Item = (&'a str, &'a str)>) -> Self {
        let mut variants: Vec<(Vec<char>, String)> = pairs
            .map(|(variant, term)| (variant.chars().collect(), term.to_string()))
            .collect();
        variants.sort_by_key(|(variant, _)| std::cmp::Reverse(variant.len()));
        Self { variants }
    }

    /// Rewrites every misheard variant in `text` to its term.
    ///
    /// Matching is case-insensitive and respects word boundaries. It is a
    /// single left-to-right pass where the longest variant wins, so one rule's
    /// output is never rewritten again by another.
    pub fn apply(&self, text: &str) -> String {
        if self.variants.is_empty() {
            return text.to_string();
        }
        let chars: Vec<char> = text.chars().collect();
        let mut out = String::with_capacity(text.len());
        let mut i = 0;
        while i < chars.len() {
            let at_word_start = i == 0 || !is_word_char(chars[i - 1]);
            let matched = at_word_start
                .then(|| {
                    self.variants
                        .iter()
                        .find(|(variant, _)| matches_at(&chars, i, variant))
                })
                .flatten();
            match matched {
                Some((variant, term)) => {
                    out.push_str(term);
                    i += variant.len();
                }
                None => {
                    out.push(chars[i]);
                    i += 1;
                }
            }
        }
        out
    }
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '\'' || c == '’'
}

fn matches_at(chars: &[char], start: usize, variant: &[char]) -> bool {
    let end = start + variant.len();
    end <= chars.len()
        && chars[start..end]
            .iter()
            .zip(variant)
            .all(|(a, b)| a.to_lowercase().eq(b.to_lowercase()))
        && (end == chars.len() || !is_word_char(chars[end]))
}

/// Extracts word-level corrections from a user's edit of a transcript segment.
///
/// Only short substitutions are kept: pure insertions and deletions, long
/// rewrites, punctuation-only changes and fixes to very common words are
/// ignored because they say nothing about how the speech model mishears terms.
pub fn learn_corrections(original: &str, corrected: &str) -> Vec<LearnedCorrection> {
    // Compare bare words so added commas or full stops don't count as edits.
    fn words(text: &str) -> Vec<&str> {
        text.split_whitespace()
            .map(trim_punctuation)
            .filter(|w| !w.is_empty())
            .collect()
    }
    let (before, after) = (words(original), words(corrected));
    let mut learned: Vec<LearnedCorrection> = Vec::new();

    for (removed, added) in diff_hunks(&before, &after) {
        if removed.is_empty()
            || added.is_empty()
            || removed.len() > MAX_LEARNED_WORDS
            || added.len() > MAX_LEARNED_WORDS
        {
            continue;
        }
        let (from, to) = (removed.join(" "), added.join(" "));
        if from == to {
            continue;
        }
        if !to.chars().any(char::is_alphabetic) {
            continue;
        }
        if !from.contains(' ') && COMMON_WORDS.contains(&from.to_lowercase().as_str()) {
            continue;
        }
        let correction = LearnedCorrection { from, to };
        if !learned.contains(&correction) {
            learned.push(correction);
        }
    }
    learned
}

fn trim_punctuation(s: &str) -> &str {
    s.trim_matches(|c: char| !c.is_alphanumeric())
}

/// Word-level LCS diff, returning each changed region as (removed, added).
fn diff_hunks<'a>(a: &[&'a str], b: &[&'a str]) -> Vec<(Vec<&'a str>, Vec<&'a str>)> {
    // Edits are made to a single segment, so an O(n·m) table is small.
    let (n, m) = (a.len(), b.len());
    let mut lcs = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if a[i] == b[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }

    let mut hunks = Vec::new();
    let (mut removed, mut added) = (Vec::new(), Vec::new());
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            if !removed.is_empty() || !added.is_empty() {
                hunks.push((std::mem::take(&mut removed), std::mem::take(&mut added)));
            }
            i += 1;
            j += 1;
        } else if j < m && (i == n || lcs[i][j + 1] >= lcs[i + 1][j]) {
            added.push(b[j]);
            j += 1;
        } else {
            removed.push(a[i]);
            i += 1;
        }
    }
    if !removed.is_empty() || !added.is_empty() {
        hunks.push((removed, added));
    }
    hunks
}

/// Applies `rules` to every segment of a meeting except `skip_id`, returning
/// how many segments changed.
pub fn apply_to_meeting(
    db: &Database,
    meeting_id: &str,
    rules: &Rules,
    skip_id: Option<&str>,
) -> Result<usize> {
    let updates: Vec<(String, String)> = db
        .get_transcript(meeting_id)?
        .into_iter()
        .filter(|segment| Some(segment.id.as_str()) != skip_id)
        .filter_map(|segment| {
            let corrected = rules.apply(&segment.text);
            (corrected != segment.text).then_some((segment.id, corrected))
        })
        .collect();
    db.replace_transcript_texts(meeting_id, &updates)?;
    Ok(updates.len())
}

#[derive(Debug, Clone, Serialize)]
pub struct SegmentEditResult {
    pub learned: Vec<LearnedCorrection>,
    /// Other segments in the meeting rewritten by what was learned.
    pub corrected_segments: usize,
}

/// Saves a user's edit to one transcript segment. With auto-learn on, word
/// substitutions in the edit join the dictionary and are applied to the rest
/// of the meeting.
pub fn record_edit(db: &Database, segment_id: &str, text: &str) -> Result<SegmentEditResult> {
    let text = text.trim();
    if text.is_empty() {
        return Err(NootleError::Other("Transcript text cannot be empty".into()));
    }
    let original = db.get_transcript_segment(segment_id)?;
    db.replace_transcript_texts(
        &original.meeting_id,
        &[(segment_id.to_string(), text.to_string())],
    )?;

    let learned = if db.get_bool_setting(AUTO_LEARN_SETTING, true) {
        learn_corrections(&original.text, text)
    } else {
        Vec::new()
    };
    let corrected_segments = if learned.is_empty() {
        0
    } else {
        db.learn_dictionary_corrections(&learned)?;
        let rules = Rules::from_corrections(&learned);
        apply_to_meeting(db, &original.meeting_id, &rules, Some(segment_id))?
    };
    Ok(SegmentEditResult {
        learned,
        corrected_segments,
    })
}

/// The format identifier of VoiceInk's Dictionary → Export file.
const VOICEINK_FORMAT: &str = "voiceink.dictionary";

/// The dictionary parts of a VoiceInk file. A Dictionary export has
/// `vocabulary` and `replacements`; a full settings backup has
/// `vocabularyWords` and `wordReplacements`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoiceInkFile {
    format: Option<String>,
    vocabulary: Option<Vec<VoiceInkTerm>>,
    replacements: Option<Vec<VoiceInkReplacement>>,
    vocabulary_words: Option<Vec<VoiceInkWord>>,
    /// Comma-separated misheard variants → replacement.
    word_replacements: Option<BTreeMap<String, String>>,
}

impl VoiceInkFile {
    fn has_dictionary(&self) -> bool {
        self.vocabulary.is_some()
            || self.replacements.is_some()
            || self.vocabulary_words.is_some()
            || self.word_replacements.is_some()
    }
}

#[derive(Deserialize)]
struct VoiceInkTerm {
    term: String,
}

#[derive(Deserialize)]
struct VoiceInkWord {
    word: String,
}

#[derive(Deserialize)]
struct VoiceInkReplacement {
    sources: Vec<String>,
    replacement: String,
}

/// A term and its misheard variants, ready to merge into the dictionary.
pub type ImportedTerm = (String, Vec<String>);

/// Converts a VoiceInk dictionary export or settings backup into dictionary
/// terms. Vocabulary words become plain terms; word replacements become terms
/// whose misheard variants are the replacement's sources.
pub fn parse_voiceink(json: &str) -> Result<Vec<ImportedTerm>> {
    let invalid =
        || NootleError::Other("This file is not a VoiceInk dictionary or settings backup".into());
    let file: VoiceInkFile = serde_json::from_str(json).map_err(|_| invalid())?;
    if let Some(format) = file.format.as_deref().filter(|f| *f != VOICEINK_FORMAT) {
        return Err(NootleError::Other(format!(
            "Unsupported dictionary format: {format}"
        )));
    }
    if !file.has_dictionary() {
        return Err(invalid());
    }

    let words = file
        .vocabulary
        .into_iter()
        .flatten()
        .map(|v| v.term)
        .chain(file.vocabulary_words.into_iter().flatten().map(|w| w.word))
        .map(|term| (term, Vec::new()));
    let replacements = file
        .replacements
        .into_iter()
        .flatten()
        .map(|r| (r.replacement, r.sources))
        .chain(
            file.word_replacements
                .into_iter()
                .flatten()
                .map(|(sources, replacement)| {
                    let sources = sources.split(',').map(|s| s.trim().to_string()).collect();
                    (replacement, sources)
                }),
        );
    // A term can appear both as vocabulary and as a replacement; merge them.
    let mut terms: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (term, misheard) in words.chain(replacements) {
        let term = term.trim();
        if !term.is_empty() {
            terms.entry(term.to_string()).or_default().extend(misheard);
        }
    }
    Ok(terms.into_iter().collect())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ImportSummary {
    /// Terms that were not in the dictionary before.
    pub added: usize,
    /// Existing terms that gained misheard variants.
    pub updated: usize,
}

/// Merges a VoiceInk dictionary file's contents into the dictionary.
pub fn import_voiceink(db: &Database, json: &str) -> Result<ImportSummary> {
    db.import_dictionary_entries(&parse_voiceink(json)?)
}

/// Formats the dictionary as a spelling reference for LLM prompts, or an empty
/// string when there is nothing to add.
pub fn glossary(db: &Database) -> String {
    let entries = db.list_dictionary_entries().unwrap_or_default();
    if entries.is_empty() {
        return String::new();
    }
    let terms: Vec<&str> = entries.iter().map(|e| e.term.as_str()).collect();
    format!(
        "\n\nCustom dictionary — names and terms the user cares about. The transcript \
         may misspell them; always use these exact spellings: {}",
        terms.join(", ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(term: &str, misheard: &[&str]) -> DictionaryEntry {
        DictionaryEntry {
            id: term.to_string(),
            term: term.to_string(),
            misheard: misheard.iter().map(|s| s.to_string()).collect(),
            source: "manual".to_string(),
            created_at: String::new(),
        }
    }

    #[test]
    fn apply_replaces_case_insensitively_on_word_boundaries() {
        let entries = [entry("Nootle", &["noodle"])];
        assert_eq!(
            Rules::new(&entries).apply("Noodle records, and noodle. Noodles stay."),
            "Nootle records, and Nootle. Noodles stay."
        );
    }

    #[test]
    fn apply_prefers_longest_variant_and_does_not_chain() {
        let entries = [
            entry("Kubernetes", &["cube or net ease", "cube"]),
            entry("cube", &["Kubernetes"]),
        ];
        assert_eq!(
            Rules::new(&entries).apply("deploy to cube or net ease"),
            "deploy to Kubernetes"
        );
    }

    #[test]
    fn apply_without_rules_is_identity() {
        assert_eq!(
            Rules::new(&[entry("Nootle", &[])]).apply("noodle"),
            "noodle"
        );
    }

    #[test]
    fn learns_single_word_substitution() {
        assert_eq!(
            learn_corrections("I talked to Shavon today.", "I talked to Siobhan today."),
            vec![LearnedCorrection {
                from: "Shavon".into(),
                to: "Siobhan".into()
            }]
        );
    }

    #[test]
    fn learns_multi_word_phrase() {
        assert_eq!(
            learn_corrections("we use cube or net ease now", "we use Kubernetes now"),
            vec![LearnedCorrection {
                from: "cube or net ease".into(),
                to: "Kubernetes".into()
            }]
        );
    }

    #[test]
    fn ignores_punctuation_insertions_deletions_and_common_words() {
        assert!(learn_corrections("hello world", "hello, world.").is_empty());
        assert!(learn_corrections("hello world", "hello big world").is_empty());
        assert!(learn_corrections("hello big world", "hello world").is_empty());
        assert!(learn_corrections("over their now", "over there now").is_empty());
        assert!(learn_corrections("a b c d e f", "u v w x y z").is_empty());
    }

    #[test]
    fn learns_capitalisation_fix() {
        assert_eq!(
            learn_corrections("ship nootle today", "ship Nootle today"),
            vec![LearnedCorrection {
                from: "nootle".into(),
                to: "Nootle".into()
            }]
        );
    }

    #[test]
    fn learned_corrections_are_stored_and_applied_to_the_meeting() {
        use crate::db::{NewMeeting, NewTranscriptSegment};

        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(NewMeeting {
                title: "Standup".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        let segment = |text: &str, start_ms| NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: "Speaker".into(),
            text: text.into(),
            start_ms,
            end_ms: start_ms + 1000,
            confidence: 0.9,
        };
        let edited = db
            .create_transcript_segment(segment("noodle ships today", 0))
            .unwrap();
        db.create_transcript_segment(segment("is noodle ready?", 1000))
            .unwrap();

        let result = record_edit(&db, &edited.id, "Nootle ships today").unwrap();
        assert_eq!(result.corrected_segments, 1);
        let entries = db.list_dictionary_entries().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].term, "Nootle");
        assert_eq!(entries[0].misheard, vec!["noodle".to_string()]);
        assert_eq!(entries[0].source, "learned");

        let texts: Vec<String> = db
            .get_transcript(&meeting.id)
            .unwrap()
            .into_iter()
            .map(|s| s.text)
            .collect();
        assert_eq!(texts, ["Nootle ships today", "is Nootle ready?"]);

        // Reversing the fix moves the variant instead of creating a cycle.
        db.learn_dictionary_corrections(&learn_corrections("Nootle", "noodle"))
            .unwrap();
        let entries = db.list_dictionary_entries().unwrap();
        let nootle = entries.iter().find(|e| e.term == "Nootle").unwrap();
        let noodle = entries.iter().find(|e| e.term == "noodle").unwrap();
        assert!(nootle.misheard.is_empty());
        assert_eq!(noodle.misheard, vec!["Nootle".to_string()]);
    }

    #[test]
    fn parses_voiceink_dictionary_export() {
        let json = r#"{
            "format": "voiceink.dictionary",
            "schemaVersion": 1,
            "exportedAt": "2026-01-01T00:00:00Z",
            "vocabulary": [{"term": "Nootle", "createdAt": null}, {"term": "  "}],
            "replacements": [{"sources": ["cube or net ease", "cooper netties"], "replacement": "Kubernetes"}]
        }"#;
        assert_eq!(
            parse_voiceink(json).unwrap(),
            vec![
                (
                    "Kubernetes".to_string(),
                    vec!["cube or net ease".to_string(), "cooper netties".to_string()]
                ),
                ("Nootle".to_string(), vec![]),
            ]
        );
    }

    #[test]
    fn parses_voiceink_settings_backup() {
        let json = r#"{
            "version": "1.60",
            "customPrompts": [],
            "vocabularyWords": [{"word": "Siobhan"}],
            "wordReplacements": {"noodle, nootel": "Nootle"}
        }"#;
        assert_eq!(
            parse_voiceink(json).unwrap(),
            vec![
                (
                    "Nootle".to_string(),
                    vec!["noodle".to_string(), "nootel".to_string()]
                ),
                ("Siobhan".to_string(), vec![]),
            ]
        );
    }

    #[test]
    fn rejects_files_that_are_not_voiceink_dictionaries() {
        assert!(parse_voiceink("not json").is_err());
        assert!(parse_voiceink(r#"{"title": "something else"}"#).is_err());
        assert!(parse_voiceink(r#"{"format": "other", "vocabulary": []}"#).is_err());
    }

    #[test]
    fn import_merges_into_existing_entries() {
        let db = Database::new_in_memory().unwrap();
        db.upsert_dictionary_entry("Nootle", &["noodle".into()], "manual")
            .unwrap();
        let json = r#"{
            "format": "voiceink.dictionary",
            "vocabulary": [{"term": "Siobhan"}, {"term": "Nootle"}, {"term": "Kubernetes"}],
            "replacements": [
                {"sources": ["Noodle", "nootel"], "replacement": "Nootle"},
                {"sources": ["cooper netties"], "replacement": "Kubernetes"}
            ]
        }"#;
        assert_eq!(
            import_voiceink(&db, json).unwrap(),
            ImportSummary {
                added: 2,
                updated: 1
            }
        );
        let entries = db.list_dictionary_entries().unwrap();
        let nootle = entries.iter().find(|e| e.term == "Nootle").unwrap();
        assert_eq!(
            nootle.misheard,
            vec!["noodle".to_string(), "nootel".to_string()]
        );
        assert_eq!(nootle.source, "manual");
        let siobhan = entries.iter().find(|e| e.term == "Siobhan").unwrap();
        assert_eq!(siobhan.source, "imported");

        // Importing the same file again changes nothing.
        assert_eq!(
            import_voiceink(&db, json).unwrap(),
            ImportSummary {
                added: 0,
                updated: 0
            }
        );
    }

    #[test]
    fn glossary_lists_terms() {
        let db = Database::new_in_memory().unwrap();
        assert_eq!(glossary(&db), "");
        db.upsert_dictionary_entry("Nootle", &[], "manual").unwrap();
        assert!(glossary(&db).ends_with("Nootle"));
    }
}
