//! Names from the call window: who's in a Zoom (or Meet, Teams, …) call,
//! read off the name labels on their video tiles.
//!
//! While a call is recorded, the meeting window's text is read on this Mac
//! every few seconds, and names that stay on screen are kept with the
//! meeting. The pictures themselves are thrown away at once. After the
//! meeting, [`fill_in`] gives the one voice nobody recognised the one name
//! nobody claimed, and [`name_one_on_one`] names everyone on the far end of
//! a 1:1 outright. With Remember voices on, each voice named this way is
//! learned for later calls on any app.

use crate::db::Database;
use crate::diarization::{is_automatic_label, SELF_LABEL};
use crate::snapshots::{platform, shows_screen_share, Capture, TextLine};
use std::collections::{HashMap, HashSet};

/// App setting that turns reading names from the call window on. On unless
/// set to "false"; it only runs when Screen Recording is already allowed.
pub const SETTING_KEY: &str = "call_names_enabled";

/// Longest edge of the frame read: full Retina size for a typical call
/// window, since name labels are small and Vision misreads scaled-down text.
pub const CAPTURE_EDGE: f64 = 3200.0;
/// A name counts once it has been on screen this many times and in this
/// share of looks, so passing text (a chat message, a notification) isn't
/// taken for someone in the call. The share is low because speaker view
/// often shows only whoever is talking.
const MIN_SIGHTINGS: u32 = 3;
const MIN_SHARE: f64 = 0.1;
/// Name labels are small: taller or wider text is a title or a slide.
const MAX_LABEL_HEIGHT: f64 = 0.06;
const MAX_LABEL_WIDTH: f64 = 0.45;

pub fn enabled(db: &Database) -> bool {
    db.get_bool_setting(SETTING_KEY, true)
}

// ---------------------------------------------------------------------------
// Telling names from the rest of the window
// ---------------------------------------------------------------------------

/// Words in meeting apps' own buttons, menus and banners. A line with any of
/// them isn't a name.
const INTERFACE_WORDS: &[&str] = &[
    "ai",
    "allow",
    "apps",
    "audio",
    "avatars",
    "background",
    "breakout",
    "call",
    "camera",
    "captions",
    "chat",
    "co-host",
    "companion",
    "connecting",
    "copy",
    "details",
    "docs",
    "end",
    "everyone",
    "filters",
    "gallery",
    "guest",
    "hand",
    "help",
    "hide",
    "host",
    "immersive",
    "info",
    "invite",
    "join",
    "leave",
    "live",
    "lower",
    "me",
    "meet",
    "meeting",
    "mic",
    "microphone",
    "minutes",
    "more",
    "mute",
    "muted",
    "new",
    "notes",
    "original",
    "participant",
    "participants",
    "people",
    "pin",
    "polls",
    "present",
    "presenting",
    "raise",
    "reactions",
    "record",
    "recording",
    "rename",
    "rooms",
    "screen",
    "security",
    "settings",
    "share",
    "sharing",
    "show",
    "sound",
    "speaker",
    "spotlight",
    "start",
    "stop",
    "summary",
    "teams",
    "tools",
    "transcript",
    "unmute",
    "video",
    "view",
    "waiting",
    "webex",
    "whiteboards",
    "workplace",
    "you",
    "zoom",
];

/// Lower-case words that sit inside names: "Ana de la Cruz".
const NAME_PARTICLES: &[&str] = &[
    "al", "bin", "da", "de", "del", "der", "di", "la", "le", "van", "von",
];

/// The participant name in a video tile's label, e.g. "Priya Patel" from
/// "Priya Patel (she/her)" or "🎤 Priya Patel" (the mute icon is read as a
/// stray symbol), or None when the text isn't name-shaped. Labels cut short
/// to fit a small tile ("Christopher Aber…") are left out rather than kept
/// as a wrong name.
fn name_label(text: &str) -> Option<String> {
    let name = text.split('(').next()?.trim();
    if name.ends_with('…') || name.ends_with("..") {
        return None;
    }
    let name = name.trim_matches(|c: char| !c.is_alphabetic());
    let words: Vec<&str> = name.split_whitespace().collect();
    if words.is_empty() || words.len() > 4 || name.chars().count() > 40 {
        return None;
    }
    // Starts with a capital, or with a letter of a script without case.
    let is_name_word = |w: &str| {
        w.chars()
            .next()
            .is_some_and(|c| c.is_alphabetic() && !c.is_lowercase())
            && w.chars().all(|c| c.is_alphabetic() || "-'’.".contains(c))
    };
    let shaped = is_name_word(words[0])
        && words
            .iter()
            .all(|w| is_name_word(w) || NAME_PARTICLES.contains(w))
        && name.chars().filter(|c| c.is_alphabetic()).count() >= 2;
    let interface = words
        .iter()
        .any(|w| INTERFACE_WORDS.contains(&w.to_lowercase().trim_end_matches(['.', '\'', '’'])));
    (shaped && !interface).then(|| words.join(" "))
}

/// Whether two ways of writing a name are the same person: "Priya Patel"
/// matches "Priya Patel", "priya" and "Priya K. Patel", not "Priya Shah".
/// Used to spot the user's own tile from the Mac account's full name.
fn same_person(a: &str, b: &str) -> bool {
    let a: Vec<String> = a.split_whitespace().map(str::to_lowercase).collect();
    let b: Vec<String> = b.split_whitespace().map(str::to_lowercase).collect();
    match (a.as_slice(), b.as_slice()) {
        ([], _) | (_, []) => false,
        ([only], [first, ..]) | ([first, ..], [only]) => only == first,
        ([a_first, .., a_last], [b_first, .., b_last]) => a_first == b_first && a_last == b_last,
    }
}

/// Everyone seen in the call window over a meeting.
#[derive(Default)]
pub struct Roster {
    looks: u32,
    /// Sightings per name, keyed in lower case, with the name as shown.
    seen: HashMap<String, (String, u32)>,
}

impl Roster {
    /// Notes the names in one look at the meeting window. Looks at shared
    /// content are skipped: slide text is often name-shaped.
    pub fn observe(&mut self, lines: &[TextLine]) {
        let text: Vec<&str> = lines.iter().map(|l| l.text.as_str()).collect();
        if shows_screen_share(&text.join("\n")) {
            return;
        }
        self.looks += 1;
        let mut this_look = HashSet::new();
        let labels = lines
            .iter()
            .filter(|l| l.height <= MAX_LABEL_HEIGHT && l.width <= MAX_LABEL_WIDTH)
            .filter_map(|l| name_label(&l.text));
        for name in labels {
            let key = name.to_lowercase();
            if this_look.insert(key.clone()) {
                self.seen.entry(key).or_insert((name, 0)).1 += 1;
            }
        }
    }

    /// Names that stayed on screen, most seen first, leaving out `you`.
    pub fn names(&self, you: &str) -> Vec<String> {
        let mut names: Vec<&(String, u32)> = self
            .seen
            .values()
            .filter(|(_, n)| *n >= MIN_SIGHTINGS && *n as f64 >= MIN_SHARE * self.looks as f64)
            .filter(|(name, _)| !same_person(name, you))
            .collect();
        names.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        names.into_iter().map(|(name, _)| name.clone()).collect()
    }
}

// ---------------------------------------------------------------------------
// Naming the meeting's voices
// ---------------------------------------------------------------------------

/// The names read off a meeting's call window, leaving out its title (some
/// apps show it in name-sized text).
pub fn for_meeting(db: &Database, meeting_id: &str) -> Vec<String> {
    let title = db
        .get_meeting(meeting_id)
        .map(|m| m.title)
        .unwrap_or_default();
    let mut names = db.get_call_names(meeting_id).unwrap_or_default();
    names.retain(|n| !n.eq_ignore_ascii_case(title.trim()));
    names
}

/// The call's names that aren't any of `speakers` yet: who's left to name.
pub fn unclaimed<'a>(
    call_names: &'a [String],
    speakers: &'a [String],
) -> impl Iterator<Item = &'a String> {
    call_names
        .iter()
        .filter(|name| !speakers.iter().any(|s| same_person(s, name)))
}

/// Puts a name from the call on a voice nobody recognised, when exactly one
/// voice is unnamed and exactly one person in the call is unaccounted for.
/// Anything less certain is left as "Speaker N" for the user to name (the
/// call's names are offered as suggestions then). Returns the index of the
/// voice it named.
pub fn fill_in(names: &mut [Option<String>], call_names: &[String]) -> Option<usize> {
    let mut unnamed = (0..names.len()).filter(|&i| names[i].is_none());
    let voice = unnamed.next().filter(|_| unnamed.next().is_none())?;
    let named: Vec<String> = names.iter().flatten().cloned().collect();
    let mut left = unclaimed(call_names, &named);
    let name = left.next().filter(|_| left.next().is_none())?;
    names[voice] = Some(name.clone());
    Some(voice)
}

/// The name for every unnamed remote speaker when the call window showed
/// exactly one other person: in a 1:1, whoever spoke on the far end is
/// them, however many voices the speaker pass split them into (and even
/// with no speaker model at all). None unless the user's own lines were
/// told apart as "You" (without system audio they're "Speaker" too), or
/// when the transcript already names someone else, since then the call
/// wasn't the 1:1 it looked like.
fn one_on_one_name<'a>(labels: &[&str], call_names: &'a [String]) -> Option<&'a String> {
    let [name] = call_names else {
        return None;
    };
    if !labels.contains(&SELF_LABEL) {
        return None;
    }
    let remote = labels.iter().filter(|&&l| l != SELF_LABEL);
    let unnamed = remote.clone().any(|l| is_automatic_label(l));
    let others_named = remote.clone().any(|l| !is_automatic_label(l) && !same_person(l, name));
    (unnamed && !others_named).then_some(name)
}

/// After a 1:1 call, puts the other person's name on every remote line still
/// labelled "Speaker" or "Speaker N". Returns whether the transcript changed.
pub fn name_one_on_one(db: &Database, meeting_id: &str) -> anyhow::Result<bool> {
    let segments = db.get_transcript(meeting_id)?;
    let labels: Vec<&str> = segments.iter().map(|s| s.speaker_label.as_str()).collect();
    let call_names = for_meeting(db, meeting_id);
    let Some(name) = one_on_one_name(&labels, &call_names) else {
        return Ok(false);
    };
    let changed: Vec<(String, String)> = segments
        .iter()
        .filter(|s| s.speaker_label != SELF_LABEL && is_automatic_label(&s.speaker_label))
        .map(|s| (s.id.clone(), name.clone()))
        .collect();
    db.relabel_transcript(meeting_id, &changed)?;
    Ok(!changed.is_empty())
}

// ---------------------------------------------------------------------------
// Running alongside a recording
// ---------------------------------------------------------------------------

/// Reads names off the call window over one recording, storing them as
/// they change so a meeting recovered after a crash still has them.
pub struct NameReader {
    roster: Roster,
    /// The Mac account's name, to leave the user's own tile out.
    you: String,
    stored: Vec<String>,
    /// Looks that found no call window to read, for the log.
    no_window: u32,
}

impl Default for NameReader {
    fn default() -> Self {
        Self {
            roster: Roster::default(),
            you: platform::full_user_name(),
            stored: Vec::new(),
            no_window: 0,
        }
    }
}

impl NameReader {
    /// Notes a look that found no call window, e.g. while it's minimised.
    pub fn missed(&mut self) {
        self.no_window += 1;
    }

    /// Logs what the recording's names came to, so a call that yielded none
    /// can be told apart from one whose window was never found.
    pub fn log_summary(&self, meeting_id: &str) {
        tracing::info!(
            "Call names for meeting {meeting_id}: {:?} from {} looks at the call window \
             ({} looks found no window)",
            self.stored,
            self.roster.looks,
            self.no_window
        );
    }

    pub fn read(&mut self, db: &Database, meeting_id: &str, frame: &Capture) {
        // While the user shares their own screen, the frame is that screen,
        // not anyone's tile.
        if frame.own_share {
            return;
        }
        match platform::recognize_jpeg(&frame.jpeg) {
            Ok(lines) => self.roster.observe(&lines),
            Err(e) => {
                tracing::debug!("Call name recognition failed: {e:#}");
                return;
            }
        }
        let names = self.roster.names(&self.you);
        if names != self.stored {
            match db.set_call_names(meeting_id, &names) {
                Ok(()) => self.stored = names,
                Err(e) => tracing::warn!("Couldn't store call names: {e}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label(text: &str) -> TextLine {
        TextLine {
            text: text.into(),
            width: 0.15,
            height: 0.02,
        }
    }

    #[test]
    fn reads_names_not_buttons() {
        assert_eq!(name_label("Priya Patel").as_deref(), Some("Priya Patel"));
        assert_eq!(name_label("Sam (Host)").as_deref(), Some("Sam"));
        assert_eq!(
            name_label("Ana de la Cruz (she/her)").as_deref(),
            Some("Ana de la Cruz")
        );
        assert_eq!(
            name_label("Zoë O’Brien-Smith").as_deref(),
            Some("Zoë O’Brien-Smith")
        );
        // Zoom's mute icon in front of the name, read as a symbol.
        assert_eq!(name_label("% Priya Patel").as_deref(), Some("Priya Patel"));
        assert_eq!(name_label("田中 太郎").as_deref(), Some("田中 太郎"));
        for ui in [
            "Mute",
            "Stop Video",
            "Participants 3",
            "Share Screen",
            "Speaker View",
            "Zoom Workplace",
            "12:41",
            "abc-defg-hij",
            "Leave",
            "You",
            "the quarterly plan",
            "A",
            "Christopher Aber…",
            "Christopher Aber...",
        ] {
            assert_eq!(name_label(ui), None, "{ui}");
        }
    }

    #[test]
    fn matches_ways_of_writing_a_name() {
        assert!(same_person("Priya Patel", "Priya Patel"));
        assert!(same_person("priya", "Priya Patel"));
        assert!(same_person("Priya Patel", "Priya"));
        assert!(same_person("Priya K. Patel", "Priya Patel"));
        assert!(!same_person("Priya Shah", "Priya Patel"));
        assert!(!same_person("Sam", "Priya Patel"));
        assert!(!same_person("Sam", ""));
    }

    #[test]
    fn keeps_names_that_stay_on_screen() {
        let mut roster = Roster::default();
        for i in 0..10 {
            let mut lines = vec![label("Priya Patel"), label("Sam Lee"), label("Mute")];
            if i == 4 {
                lines.push(label("Jordan Ray")); // a passing notification
            }
            roster.observe(&lines);
        }
        assert_eq!(roster.names(""), ["Priya Patel", "Sam Lee"]);
        assert_eq!(roster.names("Sam Lee"), ["Priya Patel"]);
    }

    #[test]
    fn ignores_shared_slides_and_big_text() {
        let mut roster = Roster::default();
        let title = TextLine {
            height: 0.1,
            ..label("Revenue Growth")
        };
        for _ in 0..5 {
            roster.observe(&[label("Sam Lee"), title.clone()]);
            roster.observe(&[
                label("You are viewing Sam Lee's screen"),
                label("Roadmap Review"),
            ]);
        }
        assert_eq!(roster.names(""), ["Sam Lee"]);
    }

    #[test]
    fn names_the_one_voice_left_with_the_one_name_left() {
        // A 1:1: one voice, one other person.
        let mut names = vec![None];
        assert_eq!(fill_in(&mut names, &["Priya Patel".into()]), Some(0));
        assert_eq!(names, [Some("Priya Patel".to_string())]);

        // Sam's voice was recognised, so the other voice is Priya.
        let mut names = vec![Some("Sam".to_string()), None];
        fill_in(&mut names, &["Sam Lee".into(), "Priya Patel".into()]);
        assert_eq!(names[1].as_deref(), Some("Priya Patel"));
    }

    #[test]
    fn names_everyone_on_the_far_end_of_a_one_on_one() {
        let priya = ["Priya Patel".to_string()];
        // Split into two voices, or no speaker model at all.
        let name = one_on_one_name(&["You", "Speaker 1", "Speaker 2"], &priya);
        assert_eq!(name.map(String::as_str), Some("Priya Patel"));
        let name = one_on_one_name(&["Speaker", "You"], &priya);
        assert_eq!(name.map(String::as_str), Some("Priya Patel"));
        // One voice already named her; the other split-off voice is her too.
        assert!(one_on_one_name(&["You", "Priya", "Speaker 2"], &priya).is_some());
        // Someone else spoke, so it wasn't a 1:1.
        assert!(one_on_one_name(&["You", "Sam", "Speaker 1"], &priya).is_none());
        // No system audio: the user's own lines are "Speaker" too.
        assert!(one_on_one_name(&["Speaker"], &priya).is_none());
        // Nothing left to name, or more than one person on screen.
        assert!(one_on_one_name(&["You", "Priya Patel"], &priya).is_none());
        let two = ["Priya Patel".to_string(), "Sam Lee".to_string()];
        assert!(one_on_one_name(&["You", "Speaker 1"], &two).is_none());
    }

    #[test]
    fn leaves_anything_uncertain_unnamed() {
        // Two unknown voices, two names: no way to tell who's who.
        let mut names = vec![None, None];
        assert_eq!(fill_in(&mut names, &["A Lee".into(), "B Ray".into()]), None);
        // One voice, but someone else in the call stayed silent.
        let mut names = vec![None];
        assert_eq!(fill_in(&mut names, &["A Lee".into(), "B Ray".into()]), None);
        // Nobody else on screen.
        let mut names = vec![None];
        assert_eq!(fill_in(&mut names, &[]), None);
        assert_eq!(names, [None]);
    }
}
