//! Remembered voices: once you name a speaker ("Speaker 2" → "Priya"),
//! Nootle can recognise that voice in later meetings and name them for you.
//!
//! Opt-in, because a voice fingerprint is biometric data. Fingerprints are
//! 256 numbers per person computed on this Mac, stored only in the local
//! database, never sent anywhere, and deleted with one click.

use crate::db::{Database, VoiceProfile};
use crate::diarization::{cosine_similarity, is_automatic_label};
use crate::error::Result;

/// Setting that turns remembered voices on.
pub const SETTING_KEY: &str = "remember_voices";
/// How alike a meeting voice and a remembered one must be to share a name.
/// Same-speaker fingerprints across meetings typically score 0.65–0.85 and
/// different speakers below 0.4.
const MATCH_SIMILARITY: f32 = 0.6;

pub fn enabled(db: &Database) -> bool {
    db.get_setting(SETTING_KEY)
        .ok()
        .flatten()
        .is_some_and(|v| v == "true")
}

/// Names for a meeting's speakers (one fingerprint each) from remembered
/// voices: each speaker gets the best match above the threshold, and each
/// name is used at most once per meeting.
pub fn recognize(db: &Database, speakers: &[Vec<f32>]) -> Vec<Option<String>> {
    let mut names = vec![None; speakers.len()];
    if !enabled(db) || speakers.is_empty() {
        return names;
    }
    let profiles = db.list_voice_profiles().unwrap_or_default();
    let mut pairs: Vec<(f32, usize, usize)> = speakers
        .iter()
        .enumerate()
        .flat_map(|(s, voice)| {
            profiles
                .iter()
                .enumerate()
                .map(move |(p, profile)| (cosine_similarity(voice, &profile.embedding), s, p))
        })
        .filter(|(sim, _, _)| *sim >= MATCH_SIMILARITY)
        .collect();
    pairs.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut used = vec![false; profiles.len()];
    for (_, s, p) in pairs {
        if names[s].is_none() && !used[p] {
            names[s] = Some(profiles[p].name.clone());
            used[p] = true;
        }
    }
    names
}

/// Keeps each speaker's fingerprint from the post-meeting speaker pass, so
/// naming them later can teach Nootle their voice.
pub fn remember_meeting_voices(db: &Database, meeting_id: &str, voices: &[(String, Vec<f32>)]) {
    if !enabled(db) {
        return;
    }
    if let Err(e) = db.save_meeting_voices(meeting_id, voices) {
        tracing::warn!("Couldn't keep speaker fingerprints for {meeting_id}: {e}");
    }
}

/// After a speaker is renamed in a meeting: their fingerprint follows the
/// new name, and a real name ("Priya", not "Speaker 3") is learned as a
/// remembered voice.
pub fn learn_from_rename(db: &Database, meeting_id: &str, from: &str, to: &str) -> Result<()> {
    let Some(voice) = db.take_meeting_voice(meeting_id, from)? else {
        return Ok(());
    };
    if is_automatic_label(to) || !enabled(db) {
        return Ok(());
    }
    db.save_meeting_voices(meeting_id, &[(to.to_string(), voice.clone())])?;
    db.learn_voice_profile(to, &voice)?;
    Ok(())
}

/// Every remembered voice, for Settings.
pub fn list(db: &Database) -> Result<Vec<VoiceProfile>> {
    db.list_voice_profiles()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::NewMeeting;

    fn meeting(db: &Database) -> String {
        db.create_meeting(NewMeeting {
            title: "1:1".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap()
        .id
    }

    #[test]
    fn naming_a_speaker_teaches_their_voice() {
        let db = Database::new_in_memory().unwrap();
        db.set_setting(SETTING_KEY, "true").unwrap();
        let priya = vec![0.8, 0.6, 0.0];
        let first = meeting(&db);
        remember_meeting_voices(&db, &first, &[("Speaker 2".into(), priya.clone())]);
        learn_from_rename(&db, &first, "Speaker 2", "Priya").unwrap();
        assert_eq!(list(&db).unwrap()[0].name, "Priya");

        // Next meeting: a similar voice is recognised, a different one isn't.
        let names = recognize(&db, &[vec![0.0, 0.0, 1.0], vec![0.75, 0.65, 0.05]]);
        assert_eq!(names, [None, Some("Priya".to_string())]);
    }

    #[test]
    fn nothing_is_kept_unless_turned_on() {
        let db = Database::new_in_memory().unwrap();
        let id = meeting(&db);
        remember_meeting_voices(&db, &id, &[("Speaker 1".into(), vec![1.0, 0.0])]);
        learn_from_rename(&db, &id, "Speaker 1", "Sam").unwrap();
        assert!(list(&db).unwrap().is_empty());
        assert_eq!(db.take_meeting_voice(&id, "Speaker 1").unwrap(), None);
    }

    #[test]
    fn merging_speakers_learns_nothing_and_each_name_is_used_once() {
        let db = Database::new_in_memory().unwrap();
        db.set_setting(SETTING_KEY, "true").unwrap();
        let id = meeting(&db);
        remember_meeting_voices(&db, &id, &[("Speaker 2".into(), vec![1.0, 0.0])]);
        learn_from_rename(&db, &id, "Speaker 2", "Speaker 1").unwrap();
        assert!(list(&db).unwrap().is_empty());

        db.learn_voice_profile("Sam", &[1.0, 0.0]).unwrap();
        let names = recognize(&db, &[vec![0.9, 0.1], vec![0.99, 0.01]]);
        assert_eq!(
            names,
            [None, Some("Sam".to_string())],
            "the closer voice wins"
        );
        db.forget_all_voices().unwrap();
        assert!(list(&db).unwrap().is_empty());
    }
}
