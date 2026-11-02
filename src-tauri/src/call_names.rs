//! Names from the call window: who's in a Zoom (or Meet, Teams, …) call,
//! read off the name labels on their video tiles.
//!
//! While a call is recorded, the meeting window's text is read on this Mac
//! every few seconds, and names that stay on screen are kept with the
//! meeting, along with who the app showed as talking at that moment (the
//! tile it outlined, or the big tile in speaker view). The pictures
//! themselves are thrown away at once. After the meeting,
//! [`name_from_sightings`] gives each voice the name that was shown talking
//! while it spoke, and [`fill_in`] names the rest when it's certain: the
//! far end of a 1:1, or the one voice left with the one name left. With
//! Remember voices on, each voice named this way is learned for later calls
//! on any app.

use crate::db::Database;
use crate::snapshots::{platform, shows_screen_share, Capture, TextLine};
use image::RgbImage;
use std::collections::{HashMap, HashSet};

/// App setting that turns reading names from the call window on. On unless
/// set to "false"; it only runs when Screen Recording is already allowed.
pub const SETTING_KEY: &str = "call_names_enabled";

/// Longest edge of the frame read: full Retina size for a typical call
/// window, since name labels are small and Vision misreads scaled-down text.
pub const CAPTURE_EDGE: f64 = 3200.0;
/// A name counts once it has been on screen this many times and in this
/// share of looks, so passing text (a chat message, a notification) isn't
/// taken for someone in the call.
const MIN_SIGHTINGS: u32 = 3;
const MIN_SHARE: f64 = 0.3;
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
pub(crate) fn same_person(a: &str, b: &str) -> bool {
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
    /// content are skipped (slide text is often name-shaped); returns
    /// whether this one counted.
    pub fn observe(&mut self, lines: &[TextLine]) -> bool {
        let text: Vec<&str> = lines.iter().map(|l| l.text.as_str()).collect();
        if shows_screen_share(&text.join("\n")) {
            return false;
        }
        self.looks += 1;
        let mut this_look = HashSet::new();
        for (_, name) in labels(lines) {
            let key = name.to_lowercase();
            if this_look.insert(key.clone()) {
                self.seen.entry(key).or_insert((name, 0)).1 += 1;
            }
        }
        true
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

/// The name labels in one look at the window, with the line each came from.
fn labels(lines: &[TextLine]) -> impl Iterator<Item = (&TextLine, String)> {
    lines
        .iter()
        .filter(|l| l.height <= MAX_LABEL_HEIGHT && l.width <= MAX_LABEL_WIDTH)
        .filter_map(|l| Some((l, name_label(&l.text)?)))
}

// ---------------------------------------------------------------------------
// Who's talking
// ---------------------------------------------------------------------------

/// The call app showing someone as talking, at a point in the recording.
#[derive(Debug, Clone, PartialEq)]
pub struct Sighting {
    pub offset_ms: i64,
    pub name: String,
    /// Their tile was outlined. Otherwise they were the big tile of speaker
    /// view, which keeps showing the last person from the far end while
    /// the user talks.
    pub outlined: bool,
}

/// A label in speaker view's filmstrip sits this high up the window or
/// more (measured from the bottom); the big tile's label sits in the
/// bottom half.
const FILMSTRIP_Y: f64 = 0.75;
const MAIN_TILE_Y: f64 = 0.5;

/// Who the meeting window shows talking: the one name whose tile is
/// outlined (Zoom draws a green border round whoever is talking, Teams and
/// Meet a coloured one), else in speaker view the name on the big tile,
/// the only label below a filmstrip of others. `outlined` says which.
pub fn active_speaker(lines: &[TextLine], frame: &RgbImage) -> Option<(String, bool)> {
    let found: Vec<(&TextLine, String)> = labels(lines).collect();
    let mut outlined = found.iter().filter(|(l, _)| is_outlined(frame, l));
    if let Some((_, name)) = outlined.next() {
        return outlined.next().is_none().then(|| (name.clone(), true));
    }
    let (low, high): (Vec<_>, Vec<_>) = found.iter().partition(|(l, _)| l.y < MAIN_TILE_Y);
    match low.as_slice() {
        [(_, name)] if !high.is_empty() && high.iter().all(|(l, _)| l.y >= FILMSTRIP_Y) => {
            Some((name.clone(), false))
        }
        _ => None,
    }
}

/// Whether a label's tile has a highlight border: a vivid line just left of
/// the label running its full height, and one just below it running its
/// full width, which is the tile's bottom-left corner where apps put names.
fn is_outlined(frame: &RgbImage, line: &TextLine) -> bool {
    let (w, h) = (frame.width() as f64, frame.height() as f64);
    let left = (line.x * w).max(0.0) as u32;
    let right = (((line.x + line.width) * w) as u32).min(frame.width());
    let top = ((1.0 - line.y - line.height) * h).max(0.0) as u32;
    let bottom = (((1.0 - line.y) * h) as u32).min(frame.height());
    if right <= left || bottom <= top {
        return false;
    }
    // Far enough to pass the mute icon and the label's padding.
    let reach = ((bottom - top) * 5).max(10);
    let mostly_vivid = |pixels: &mut dyn Iterator<Item = (u32, u32)>| {
        let (vivid, n) = pixels.fold((0, 0), |(vivid, n), (x, y)| {
            (vivid + u32::from(is_vivid(frame.get_pixel(x, y))), n + 1)
        });
        vivid * 5 >= n * 4
    };
    let edge_left = || {
        (left.saturating_sub(reach)..left).any(|x| mostly_vivid(&mut (top..bottom).map(|y| (x, y))))
    };
    let edge_below = || {
        (bottom..(bottom + reach).min(frame.height()))
            .any(|y| mostly_vivid(&mut (left..right).map(|x| (x, y))))
    };
    edge_left() && edge_below()
}

/// A saturated, bright colour, as highlight borders are. Reds are left
/// out: they're mute icons and recording dots.
fn is_vivid(px: &image::Rgb<u8>) -> bool {
    let [r, g, b] = px.0.map(f32::from);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    if max < 128.0 || (max - min) < 0.5 * max {
        return false;
    }
    let red = max == r && g.max(b) < 0.6 * r;
    !red
}

/// A sighting counts for the speech it falls in, or speech within this
/// much of it: the picture and the sound of a call aren't quite in step.
const SIGHTING_SLACK_MS: i64 = 1_000;

/// The sentence `offset_ms` falls in, else the nearest one within the slack.
pub fn sentence_at(spans: &[(i64, i64)], offset_ms: i64) -> Option<usize> {
    spans
        .iter()
        .enumerate()
        .map(|(i, &(start, end))| (i, (start - offset_ms).max(offset_ms - end).max(0)))
        .filter(|&(_, gap)| gap <= SIGHTING_SLACK_MS)
        .min_by_key(|&(_, gap)| gap)
        .map(|(i, _)| i)
}

/// The user's own name as the call shows it: whoever was outlined as talking
/// while the user was. Catches a Zoom name that isn't the Mac account's.
/// `you_spoke` says whether the user was talking at a point in the meeting.
pub fn own_name(sightings: &[Sighting], you_spoke: impl Fn(i64) -> bool) -> Option<String> {
    let mine = sightings
        .iter()
        .filter(|s| s.outlined && you_spoke(s.offset_ms))
        .map(|s| s.name.as_str());
    winner(mine, 2)
}

/// The name most `votes` agree on, when at least `min_votes` and two in
/// three of them do.
fn winner<'a>(votes: impl Iterator<Item = &'a str>, min_votes: usize) -> Option<String> {
    let mut counts: Vec<(&str, usize)> = Vec::new();
    let mut total = 0;
    for name in votes {
        total += 1;
        match counts.iter_mut().find(|(n, _)| same_person(n, name)) {
            Some((_, count)) => *count += 1,
            None => counts.push((name, 1)),
        }
    }
    let (name, n) = counts.into_iter().max_by_key(|&(_, n)| n)?;
    (n >= min_votes && n * 3 >= total * 2).then(|| name.to_string())
}

/// Names each unnamed voice after whoever the call showed talking while it
/// spoke, when at least `min_votes` sightings and two in three of its
/// sightings agree. `voice_at` gives the voice speaking at a point in the
/// meeting, or None for the user or silence. Returns the voices it named.
pub fn name_from_sightings(
    voices: &mut [Option<String>],
    sightings: &[Sighting],
    voice_at: impl Fn(i64) -> Option<usize>,
    min_votes: usize,
) -> Vec<usize> {
    let mut seen: Vec<Vec<&str>> = vec![Vec::new(); voices.len()];
    for s in sightings {
        if let Some(v) = voice_at(s.offset_ms).filter(|&v| v < voices.len()) {
            seen[v].push(&s.name);
        }
    }
    let mut named = Vec::new();
    for (i, names) in seen.into_iter().enumerate() {
        if voices[i].is_some() {
            continue;
        }
        if let Some(name) = winner(names.into_iter(), min_votes) {
            voices[i] = Some(name);
            named.push(i);
        }
    }
    named
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

/// The other person in a 1:1: the one name read off the call window.
pub fn one_on_one(call_names: &[String]) -> Option<&String> {
    match call_names {
        [name] => Some(name),
        _ => None,
    }
}

/// Puts names from the call on the voices nobody recognised. In a 1:1 every
/// voice from the far end is the other person, however many the speaker
/// pass split them into, unless one was recognised as someone else.
/// Otherwise a name goes on the one voice left unnamed when exactly one
/// person in the call is unaccounted for. Anything less certain is left as
/// "Speaker N" for the user to name (the call's names are offered as
/// suggestions then). `voices` must all be from the far end of a call.
/// Returns the index of a voice it named.
pub fn fill_in(voices: &mut [Option<String>], call_names: &[String]) -> Option<usize> {
    let first_unnamed = voices.iter().position(Option::is_none)?;
    if let Some(name) = one_on_one(call_names) {
        if voices.iter().flatten().all(|n| same_person(n, name)) {
            // Under the name a voice was already recognised as, if any, so
            // they're one speaker.
            let name = voices.iter().flatten().next().unwrap_or(name).clone();
            for voice in voices.iter_mut().filter(|v| v.is_none()) {
                *voice = Some(name.clone());
            }
            return Some(first_unnamed);
        }
    }
    if voices.iter().filter(|v| v.is_none()).count() != 1 {
        return None;
    }
    let named: Vec<String> = voices.iter().flatten().cloned().collect();
    let mut left = unclaimed(call_names, &named);
    let name = left.next().filter(|_| left.next().is_none())?;
    voices[first_unnamed] = Some(name.clone());
    Some(first_unnamed)
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
    /// Looks that showed who was talking, for the log.
    sightings: u32,
    /// Looks that found no call window to read, for the log.
    no_window: u32,
}

impl Default for NameReader {
    fn default() -> Self {
        Self {
            roster: Roster::default(),
            you: platform::full_user_name(),
            stored: Vec::new(),
            sightings: 0,
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
            "Call names for meeting {meeting_id}: {} names from {} looks at the call window, \
             {} showing who was talking ({} looks found no window)",
            self.stored.len(),
            self.roster.looks,
            self.sightings,
            self.no_window
        );
    }

    pub fn read(&mut self, db: &Database, meeting_id: &str, frame: &Capture, offset_ms: i64) {
        // While the user shares their own screen, the frame is that screen,
        // not anyone's tile.
        if frame.own_share {
            return;
        }
        let lines = match platform::recognize_jpeg(&frame.jpeg) {
            Ok(lines) => lines,
            Err(e) => {
                tracing::debug!("Call name recognition failed: {e:#}");
                return;
            }
        };
        if !self.roster.observe(&lines) {
            return;
        }
        self.note_speaker(db, meeting_id, &lines, &frame.jpeg, offset_ms);
        let names = self.roster.names(&self.you);
        if names != self.stored {
            match db.set_call_names(meeting_id, &names) {
                Ok(()) => self.stored = names,
                Err(e) => tracing::warn!("Couldn't store call names: {e}"),
            }
        }
    }

    fn note_speaker(
        &mut self,
        db: &Database,
        meeting_id: &str,
        lines: &[TextLine],
        jpeg: &[u8],
        offset_ms: i64,
    ) {
        if labels(lines).next().is_none() {
            return;
        }
        let Ok(image) = image::load_from_memory(jpeg) else {
            return;
        };
        let Some((name, outlined)) = active_speaker(lines, &image.into_rgb8()) else {
            return;
        };
        let sighting = Sighting {
            offset_ms,
            name,
            outlined,
        };
        match db.add_call_speaker(meeting_id, &sighting) {
            Ok(()) => self.sightings += 1,
            Err(e) => tracing::warn!("Couldn't store who's talking: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label(text: &str) -> TextLine {
        TextLine {
            text: text.into(),
            x: 0.1,
            y: 0.1,
            width: 0.15,
            height: 0.02,
        }
    }

    fn label_at(text: &str, x: f64, y: f64) -> TextLine {
        TextLine {
            x,
            y,
            ..label(text)
        }
    }

    /// A 2×2 gallery, 1000×600, with a name in each tile's bottom-left
    /// corner and the tile at `talking` outlined in Zoom's green.
    fn gallery(talking: Option<usize>) -> (RgbImage, Vec<TextLine>) {
        let mut frame = RgbImage::from_pixel(1000, 600, image::Rgb([40, 40, 40]));
        let tiles = [(0, 0), (500, 0), (0, 300), (500, 300)];
        if let Some((tx, ty)) = talking.map(|t| tiles[t]) {
            for x in tx..tx + 500 {
                for y in ty..ty + 300 {
                    let edge = x < tx + 4 || x >= tx + 496 || y < ty + 4 || y >= ty + 296;
                    if edge {
                        frame.put_pixel(x, y, image::Rgb([35, 217, 89]));
                    }
                }
            }
        }
        let names = ["Priya Patel", "Sam Lee", "Ana Cruz", "Jo Ray"];
        let lines = tiles
            .iter()
            .zip(names)
            .map(|(&(tx, ty), name)| {
                // 16px tall, 30px in from the tile's left and 10px up from
                // its bottom, in Vision's bottom-left fractions.
                let bottom = ty + 290;
                label_at(name, (tx + 30) as f64 / 1000.0, 1.0 - bottom as f64 / 600.0)
            })
            .map(|l| TextLine {
                height: 16.0 / 600.0,
                width: 0.12,
                ..l
            })
            .collect();
        (frame, lines)
    }

    #[test]
    fn finds_the_outlined_tile() {
        let (frame, lines) = gallery(Some(3));
        assert_eq!(
            active_speaker(&lines, &frame),
            Some(("Jo Ray".to_string(), true))
        );
        let (frame, lines) = gallery(Some(0));
        assert_eq!(
            active_speaker(&lines, &frame),
            Some(("Priya Patel".to_string(), true))
        );
        let (frame, lines) = gallery(None);
        assert_eq!(active_speaker(&lines, &frame), None);
    }

    #[test]
    fn a_red_mute_icon_is_not_an_outline() {
        let (mut frame, lines) = gallery(None);
        // A red block left of and under Sam's label.
        for x in 505..530 {
            for y in 270..300 {
                frame.put_pixel(x, y, image::Rgb([230, 40, 40]));
            }
        }
        assert_eq!(active_speaker(&lines, &frame), None);
    }

    #[test]
    fn finds_the_big_tile_in_speaker_view() {
        let frame = RgbImage::from_pixel(1000, 600, image::Rgb([40, 40, 40]));
        let lines = [
            label_at("Priya Patel", 0.05, 0.85),
            label_at("Sam Lee", 0.25, 0.85),
            label_at("Ana Cruz", 0.03, 0.04),
        ];
        assert_eq!(
            active_speaker(&lines, &frame),
            Some(("Ana Cruz".to_string(), false))
        );
        // Gallery rows: no big tile to go by.
        let rows = [
            label_at("Priya Patel", 0.05, 0.55),
            label_at("Ana Cruz", 0.05, 0.04),
        ];
        assert_eq!(active_speaker(&rows, &frame), None);
    }

    fn seen(offset_ms: i64, name: &str) -> Sighting {
        Sighting {
            offset_ms,
            name: name.into(),
            outlined: true,
        }
    }

    #[test]
    fn matches_a_sighting_to_its_sentence() {
        let spans = [(0, 2000), (2000, 5000), (9000, 10000)];
        assert_eq!(sentence_at(&spans, 1000), Some(0));
        assert_eq!(sentence_at(&spans, 3000), Some(1));
        assert_eq!(sentence_at(&spans, 5800), Some(1));
        assert_eq!(sentence_at(&spans, 7000), None);
        assert_eq!(sentence_at(&spans, 8500), Some(2));
    }

    #[test]
    fn names_voices_after_who_was_shown_talking() {
        // Voice 0 spoke over 0..10s, voice 1 over 10..20s.
        let voice_at = |t: i64| Some((t / 10_000) as usize);
        let sightings = [
            seen(1000, "Priya Patel"),
            seen(4000, "priya patel"),
            seen(7000, "Sam Lee"), // a slow switch
            seen(9000, "Priya Patel"),
            seen(12_000, "Sam Lee"),
            seen(15_000, "Ana Cruz"),
        ];
        let mut voices = vec![None, None];
        assert_eq!(
            name_from_sightings(&mut voices, &sightings, voice_at, 2),
            [0]
        );
        // Voice 1 was split between two people, so it's left.
        assert_eq!(voices, [Some("Priya Patel".to_string()), None]);

        // A voice already recognised keeps its name.
        let mut voices = vec![Some("Priya".to_string()), None];
        assert!(name_from_sightings(&mut voices, &sightings, voice_at, 2).is_empty());
        assert_eq!(voices[0].as_deref(), Some("Priya"));

        // One sighting is enough when asked.
        let mut voices = vec![None];
        name_from_sightings(&mut voices, &[seen(1000, "Sam Lee")], |_| Some(0), 1);
        assert_eq!(voices, [Some("Sam Lee".to_string())]);
    }

    #[test]
    fn spots_the_users_own_name_while_they_talk() {
        let you_spoke = |t: i64| t < 10_000;
        let sightings = [
            seen(1000, "Michelle M"),
            seen(5000, "Michelle M"),
            seen(12_000, "Priya Patel"),
        ];
        assert_eq!(
            own_name(&sightings, you_spoke).as_deref(),
            Some("Michelle M")
        );
        // Speaker view's big tile isn't the user while they talk.
        let main_tile: Vec<Sighting> = sightings
            .iter()
            .map(|s| Sighting {
                outlined: false,
                ..s.clone()
            })
            .collect();
        assert_eq!(own_name(&main_tile, you_spoke), None);
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
    fn names_every_far_end_voice_of_a_one_on_one() {
        let priya = ["Priya Patel".to_string()];
        // Her voice was split in two by the speaker pass.
        let mut names = vec![None, None];
        assert_eq!(fill_in(&mut names, &priya), Some(0));
        assert_eq!(
            names,
            [Some("Priya Patel".into()), Some("Priya Patel".into())]
        );
        // One part was recognised as her already.
        let mut names = vec![Some("Priya".to_string()), None];
        assert_eq!(fill_in(&mut names, &priya), Some(1));
        assert_eq!(names[1].as_deref(), Some("Priya"));
        // Someone else spoke, so it wasn't the 1:1 it looked like: either
        // unnamed voice could be Priya.
        let mut names = vec![Some("Sam".to_string()), None, None];
        assert_eq!(fill_in(&mut names, &priya), None);
        assert_eq!(names[1..], [None, None]);
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
