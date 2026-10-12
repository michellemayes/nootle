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
    db.get_bool_setting(SETTING_KEY, false)
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
    if let Err(e) = db.save_meeting_voices(meeting_id, voices, false) {
        tracing::warn!("Couldn't keep speaker fingerprints for {meeting_id}: {e}");
    }
}

/// Learns the voice of a speaker the meeting named from the call window, so
/// they're recognised in later meetings, including ones with no names on
/// screen.
pub fn learn_from_call(db: &Database, meeting_id: &str, name: &str, voice: &[f32]) {
    if !enabled(db) {
        return;
    }
    if let Err(e) = name_voice(db, meeting_id, name, voice) {
        tracing::warn!("Couldn't learn {name}'s voice: {e}");
    }
}

/// After a speaker is renamed in a meeting: their fingerprint follows the
/// new name, and a real name ("Priya", not "Speaker 3") is learned as a
/// remembered voice. If the old name had learned this voice (a wrong guess
/// being corrected), it's taken back out of the old name's voice.
pub fn learn_from_rename(db: &Database, meeting_id: &str, from: &str, to: &str) -> Result<()> {
    let Some((voice, learned)) = db.take_meeting_voice(meeting_id, from)? else {
        return Ok(());
    };
    if learned {
        adjust(db, from, &voice, -1)?;
    }
    if is_automatic_label(to) || !enabled(db) {
        return Ok(());
    }
    name_voice(db, meeting_id, to, &voice)
}

/// Keeps a meeting's fingerprint under `name`, marked as learned, and folds
/// it into `name`'s remembered voice.
fn name_voice(db: &Database, meeting_id: &str, name: &str, voice: &[f32]) -> Result<()> {
    db.save_meeting_voices(meeting_id, &[(name.to_string(), voice.to_vec())], true)?;
    adjust(db, name, voice, 1)
}

/// Adds (`+1`) a meeting's fingerprint to `name`'s remembered voice, or
/// takes one back out (`-1`). The voice is the plain mean of the
/// fingerprints it was learned from, so taking one out exactly undoes
/// adding it; a voice with none left is forgotten.
fn adjust(db: &Database, name: &str, voice: &[f32], sign: i64) -> Result<()> {
    let (sum, samples) = match db.get_voice_profile(name)? {
        Some((mean, n)) => (
            mean.iter()
                .zip(voice)
                .map(|(m, v)| m * n as f32 + sign as f32 * v)
                .collect::<Vec<f32>>(),
            n + sign,
        ),
        None if sign > 0 => (voice.to_vec(), 1),
        None => return Ok(()),
    };
    if samples <= 0 {
        return db.delete_voice_profile_named(name);
    }
    let mean: Vec<f32> = sum.iter().map(|x| x / samples as f32).collect();
    db.save_voice_profile(name, &mean, samples)
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
        assert!(db.take_meeting_voice(&id, "Speaker 1").unwrap().is_none());
    }

    #[test]
    fn merging_speakers_learns_nothing_and_each_name_is_used_once() {
        let db = Database::new_in_memory().unwrap();
        db.set_setting(SETTING_KEY, "true").unwrap();
        let id = meeting(&db);
        remember_meeting_voices(&db, &id, &[("Speaker 2".into(), vec![1.0, 0.0])]);
        learn_from_rename(&db, &id, "Speaker 2", "Speaker 1").unwrap();
        assert!(list(&db).unwrap().is_empty());

        adjust(&db, "Sam", &[1.0, 0.0], 1).unwrap();
        let names = recognize(&db, &[vec![0.9, 0.1], vec![0.99, 0.01]]);
        assert_eq!(
            names,
            [None, Some("Sam".to_string())],
            "the closer voice wins"
        );
        db.forget_all_voices().unwrap();
        assert!(list(&db).unwrap().is_empty());
    }

    #[test]
    fn a_voice_named_from_the_call_is_learned_and_a_correction_moves_it() {
        let db = Database::new_in_memory().unwrap();
        db.set_setting(SETTING_KEY, "true").unwrap();
        let sam = vec![0.0, 1.0];
        adjust(&db, "Priya", &[1.0, 0.0], 1).unwrap();
        let id = meeting(&db);
        remember_meeting_voices(&db, &id, &[("Priya".into(), sam.clone())]);
        learn_from_call(&db, &id, "Priya", &sam);
        assert_eq!(list(&db).unwrap()[0].samples, 2);

        // That was Sam, not Priya: Priya's voice goes back to what it was.
        learn_from_rename(&db, &id, "Priya", "Sam").unwrap();
        assert_eq!(
            db.get_voice_profile("Priya").unwrap(),
            Some((vec![1.0, 0.0], 1))
        );
        let names = recognize(&db, &[vec![1.0, 0.0], sam]);
        assert_eq!(names, [Some("Priya".to_string()), Some("Sam".to_string())]);

        // A voice learned from only this meeting is forgotten outright.
        learn_from_rename(&db, &id, "Sam", "Speaker 2").unwrap();
        assert_eq!(list(&db).unwrap().len(), 1);
    }
}
