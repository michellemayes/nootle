//! Ask the Room: a short spoken recap of a finished meeting, voiced in the
//! meeting's own speaker order, and spoken answers to follow-up questions.
//! The user's chosen LLM writes the script; the audio is rendered on this
//! Mac with macOS speech synthesis and never leaves it. A recap is cached
//! next to the meeting's recording (`<id>.recap.wav` and `.recap.json`).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::db::{Database, TranscriptSegment};
use crate::llm::{ChatMessage, LlmRegistry};

/// Who speaks the intro, the links between topics, and anything the script
/// can't pin on someone in the meeting.
pub const NARRATOR: &str = "Narrator";

/// Pause between lines, so a change of voice doesn't sound like an
/// interruption.
const GAP_MS: u32 = 400;

/// One spoken line of a recap or answer. Timings are filled in once it's
/// rendered, so the player can show the line being spoken.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecapLine {
    pub speaker: String,
    pub text: String,
    #[serde(default)]
    pub voice: String,
    #[serde(default)]
    pub start_ms: i64,
    #[serde(default)]
    pub end_ms: i64,
}

impl RecapLine {
    pub fn new(speaker: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            speaker: speaker.into(),
            text: text.into(),
            voice: String::new(),
            start_ms: 0,
            end_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioRecap {
    pub meeting_id: String,
    pub audio_path: String,
    pub lines: Vec<RecapLine>,
    pub provider: String,
    pub model: String,
    pub created_at: String,
}

/// A spoken answer to a question put to the room.
#[derive(Debug, Clone, Serialize)]
pub struct RoomAnswer {
    pub line: RecapLine,
    pub audio_path: String,
}

/// A voice installed on this Mac, e.g. `Samantha` (`en_US`).
#[derive(Debug, Clone, PartialEq)]
pub struct Voice {
    pub name: String,
    pub locale: String,
}

/// On-device text to speech, behind a trait so the script and stitching
/// logic is testable off macOS.
pub trait SpeechSynth: Send + Sync {
    fn voices(&self) -> Result<Vec<Voice>>;
    /// Speaks `text` in `voice` (the system voice when empty) into a 16-bit
    /// PCM WAV file at `out`.
    fn speak(&self, text: &str, voice: &str, out: &Path) -> Result<()>;
}

/// macOS's `say`, which renders with the voices installed in System
/// Settings → Accessibility → Spoken Content, entirely on this Mac.
#[cfg(target_os = "macos")]
struct SaySynth;

#[cfg(target_os = "macos")]
impl SpeechSynth for SaySynth {
    fn voices(&self) -> Result<Vec<Voice>> {
        let out = std::process::Command::new("/usr/bin/say")
            .args(["-v", "?"])
            .output()
            .context("Couldn't list speech voices")?;
        Ok(parse_say_voices(&String::from_utf8_lossy(&out.stdout)))
    }

    fn speak(&self, text: &str, voice: &str, out: &Path) -> Result<()> {
        use std::io::Write;
        let mut cmd = std::process::Command::new("/usr/bin/say");
        if !voice.is_empty() {
            cmd.args(["-v", voice]);
        }
        // The text goes in on stdin so a line starting with "-" isn't
        // read as an option.
        let mut child = cmd
            .arg("-o")
            .arg(out)
            .args(["--file-format=WAVE", "--data-format=LEI16@22050"])
            .stdin(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("Couldn't start speech synthesis")?;
        // Dropping stdin ends the text; wait either way so `say` is reaped.
        let written = child
            .stdin
            .take()
            .expect("piped stdin")
            .write_all(text.as_bytes());
        let output = child.wait_with_output()?;
        written?;
        if !output.status.success() {
            bail!(
                "Speech synthesis failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        Ok(())
    }
}

/// The speech synthesizer on this machine.
pub fn system_synth() -> Result<Arc<dyn SpeechSynth>> {
    #[cfg(target_os = "macos")]
    {
        Ok(Arc::new(SaySynth))
    }
    #[cfg(not(target_os = "macos"))]
    {
        bail!("Audio recaps use macOS speech synthesis, so they only work on a Mac.")
    }
}

/// Parses `say -v '?'`: `Name   en_US    # Sample sentence`, where the name
/// may contain spaces and parentheses (`Eddy (English (US))`).
pub fn parse_say_voices(output: &str) -> Vec<Voice> {
    output
        .lines()
        .filter_map(|line| {
            let (left, _) = line.split_once('#')?;
            let (name, locale) = left.trim_end().rsplit_once(char::is_whitespace)?;
            let name = name.trim();
            (!name.is_empty() && locale.contains('_')).then(|| Voice {
                name: name.to_string(),
                locale: locale.to_string(),
            })
        })
        .collect()
}

/// Sound-effect voices that would turn a recap into a joke.
const NOVELTY_VOICES: &[&str] = &[
    "Albert",
    "Bad News",
    "Bahh",
    "Bells",
    "Boing",
    "Bubbles",
    "Cellos",
    "Good News",
    "Jester",
    "Organ",
    "Superstar",
    "Trinoids",
    "Whisper",
    "Wobble",
    "Zarvox",
];

/// The most natural-sounding English voices, best first. The first one
/// installed narrates.
const PREFERRED_VOICES: &[&str] = &[
    "Samantha", "Daniel", "Karen", "Moira", "Ava", "Tom", "Allison", "Susan", "Tessa", "Rishi",
    "Serena", "Oliver", "Kate", "Evan", "Nathan", "Zoe", "Joelle", "Noelle", "Aaron", "Nicky",
    "Fiona", "Alex", "Fred",
];

/// A voice's name without its quality suffix: `Ava (Premium)` → `Ava`.
fn base_voice_name(name: &str) -> &str {
    name.split(" (").next().unwrap_or(name)
}

/// English, non-novelty voices, best first, one per base name (the
/// Premium or Enhanced download when installed), so no two speakers get
/// what sounds like the same voice.
fn usable_voices(voices: &[Voice]) -> Vec<&str> {
    let quality = |name: &str| {
        if name.contains("(Premium)") {
            0
        } else if name.contains("(Enhanced)") {
            1
        } else {
            2
        }
    };
    let rank = |name: &str| {
        PREFERRED_VOICES
            .iter()
            .position(|p| *p == base_voice_name(name))
            .unwrap_or(PREFERRED_VOICES.len())
    };
    let mut usable: Vec<&Voice> = voices
        .iter()
        .filter(|v| v.locale.starts_with("en"))
        .filter(|v| !NOVELTY_VOICES.contains(&base_voice_name(&v.name)))
        .collect();
    // Stable, so voices outside the preferred list keep `say`'s order.
    usable.sort_by_key(|v| (rank(&v.name), quality(&v.name)));
    let mut seen = std::collections::HashSet::new();
    usable
        .into_iter()
        .map(|v| v.name.as_str())
        .filter(|name| seen.insert(base_voice_name(name)))
        .collect()
}

/// A voice for the narrator and each speaker, in order: everyone gets a
/// different voice while there are enough, then they're reused, never the
/// narrator's. An empty voice means the system default.
pub fn pick_voices(voices: &[Voice], speakers: &[String]) -> HashMap<String, String> {
    let usable = usable_voices(voices);
    let mut picked = HashMap::new();
    let narrator = usable.first().copied().unwrap_or_default();
    picked.insert(NARRATOR.to_string(), narrator.to_string());
    let others = if usable.len() > 1 {
        &usable[1..]
    } else {
        &usable[..]
    };
    for (i, speaker) in speakers.iter().enumerate() {
        let voice = others.get(i % others.len().max(1)).copied().unwrap_or("");
        picked.insert(speaker.clone(), voice.to_string());
    }
    picked
}

/// The meeting's speakers in the order they first spoke.
pub fn speakers_in_order(segments: &[TranscriptSegment]) -> Vec<String> {
    let mut speakers: Vec<String> = Vec::new();
    for s in segments {
        if !speakers.contains(&s.speaker_label) {
            speakers.push(s.speaker_label.clone());
        }
    }
    speakers
}

/// The prompt asking for a recap script: one JSON object per line.
pub fn script_messages(
    title: &str,
    speakers: &[String],
    transcript: &str,
    glossary: &str,
) -> Vec<ChatMessage> {
    vec![
        ChatMessage {
            role: "system".into(),
            content: format!(
                "You write the script for a short spoken audio recap of a meeting, like a \
                 two-to-four-minute podcast someone listens to on a walk (about 300 to 550 \
                 words in all). It is read aloud by text-to-speech, one voice per person.\n\n\
                 Start with \"{NARRATOR}\" introducing the meeting in a sentence or two. Then \
                 go through the key points, decisions and action items in the order they came \
                 up, each spoken by the person who raised it, in the first person as they \
                 would say it (\"I'll send the draft by Friday\"). {NARRATOR} links topics \
                 briefly and closes by recapping who owes what.\n\n\
                 The people in this meeting, in the order they spoke: {}. Use exactly these \
                 names, or \"{NARRATOR}\". Never invent facts, names or numbers that aren't \
                 in the transcript.\n\n\
                 Write plain spoken sentences: no markdown, bullets, emoji, timestamps or \
                 stage directions. Keep each line to one to three sentences.\n\n\
                 Output only JSON lines, one object per line and nothing else, like:\n\
                 {{\"speaker\": \"{NARRATOR}\", \"text\": \"Here's your recap of the weekly sync.\"}}\n\
                 {{\"speaker\": \"Alice\", \"text\": \"I proposed moving the launch to May.\"}}{glossary}",
                speakers.join(", ")
            ),
        },
        ChatMessage {
            role: "user".into(),
            content: format!("Meeting: {title}\n\nTranscript:\n\n{transcript}"),
        },
    ]
}

/// What to append to a question put to the room, so the answer comes back
/// as one spoken line from the person it's mostly drawn from.
pub fn answer_instructions(speakers: &[String]) -> String {
    format!(
        "\n\nYour answer will be read aloud in the voice of the person whose words it \
         mostly comes from ({}), or \"{NARRATOR}\" when it isn't one person's. Answer in \
         one to four short spoken sentences, in the first person when it's theirs, with no \
         markdown. Reply with one JSON object only: \
         {{\"speaker\": \"<name>\", \"text\": \"<answer>\"}}",
        speakers.join(", ")
    )
}

/// `name` as one of `speakers` (ignoring case, or by a unique first name),
/// else the narrator.
fn match_speaker(name: &str, speakers: &[String]) -> String {
    let name = name.trim().trim_matches(|c| c == '"' || c == '*').trim();
    if let Some(s) = speakers.iter().find(|s| s.eq_ignore_ascii_case(name)) {
        return s.clone();
    }
    let first = |s: &str| s.split_whitespace().next().unwrap_or("").to_lowercase();
    let wanted = first(name);
    let mut by_first = speakers.iter().filter(|s| first(s) == wanted);
    match (by_first.next(), by_first.next()) {
        (Some(s), None) if !wanted.is_empty() => s.clone(),
        _ => NARRATOR.to_string(),
    }
}

#[derive(Deserialize)]
struct RawLine {
    #[serde(alias = "name", alias = "role")]
    speaker: String,
    #[serde(alias = "line", alias = "content")]
    text: String,
}

/// Reads a script back from the model, tolerating what models do: a JSON
/// array instead of lines, code fences, trailing commas, chatter around the
/// JSON, and `Name: text` lines. Speakers outside the meeting go to the
/// narrator.
pub fn parse_script(raw: &str, speakers: &[String]) -> Vec<RecapLine> {
    let raw = raw.trim();
    let unfenced: String = raw
        .lines()
        .filter(|l| !l.trim_start().starts_with("```"))
        .collect::<Vec<_>>()
        .join("\n");

    let raw_lines: Vec<RawLine> = serde_json::from_str::<Vec<RawLine>>(unfenced.trim())
        .or_else(|_| {
            #[derive(Deserialize)]
            struct Wrapped {
                #[serde(alias = "script")]
                lines: Vec<RawLine>,
            }
            serde_json::from_str::<Wrapped>(unfenced.trim()).map(|w| w.lines)
        })
        .unwrap_or_else(|_| unfenced.lines().filter_map(parse_line).collect());

    raw_lines
        .into_iter()
        .map(|l| RecapLine::new(match_speaker(&l.speaker, speakers), l.text.trim()))
        .filter(|l| !l.text.is_empty())
        .collect()
}

/// One line of a script: a JSON object somewhere in it, else `Name: text`.
fn parse_line(line: &str) -> Option<RawLine> {
    let line = line.trim();
    if let (Some(start), Some(end)) = (line.find('{'), line.rfind('}')) {
        if start < end {
            if let Ok(parsed) = serde_json::from_str(&line[start..=end]) {
                return Some(parsed);
            }
        }
    }
    let (speaker, text) = line.split_once(':')?;
    let speaker = speaker.trim().trim_start_matches(['-', '*', ' ']);
    // A short label, not a sentence that happens to contain a colon.
    (!speaker.is_empty() && speaker.split_whitespace().count() <= 4 && !speaker.contains('{')).then(
        || RawLine {
            speaker: speaker.to_string(),
            text: text.to_string(),
        },
    )
}

/// An answer from the room: the first line of a script, or, when the model
/// ignored the format, its whole reply from the narrator.
pub fn parse_answer(raw: &str, speakers: &[String]) -> RecapLine {
    parse_script(raw, speakers)
        .into_iter()
        .next()
        .unwrap_or_else(|| RecapLine::new(NARRATOR, raw.trim().trim_matches('`').trim()))
}

/// Speaks each line in its speaker's voice and joins them, with a short
/// pause between, into one WAV at `out`. Returns the lines with their voices
/// and where each starts and ends in the file.
pub fn render(
    synth: &dyn SpeechSynth,
    lines: &[RecapLine],
    voices: &HashMap<String, String>,
    out: &Path,
) -> Result<Vec<RecapLine>> {
    let parts_dir = out.with_extension("parts");
    std::fs::create_dir_all(&parts_dir)?;
    let result = render_parts(synth, lines, voices, &parts_dir, out);
    let _ = std::fs::remove_dir_all(&parts_dir);
    result
}

fn render_parts(
    synth: &dyn SpeechSynth,
    lines: &[RecapLine],
    voices: &HashMap<String, String>,
    parts_dir: &Path,
    out: &Path,
) -> Result<Vec<RecapLine>> {
    let partial = out.with_extension("partial.wav");
    let mut writer: Option<hound::WavWriter<_>> = None;
    let mut written: u64 = 0;
    let mut sample_rate = 0;
    let mut channels = 1;
    let mut timed = Vec::with_capacity(lines.len());
    let voice_of = |line: &RecapLine| voices.get(&line.speaker).cloned().unwrap_or_default();
    let part = |i: usize| parts_dir.join(format!("{i}.wav"));

    // Each line is its own `say` run and file, so they're spoken side by
    // side, one per core, then stitched in order.
    let workers = std::thread::available_parallelism()
        .map_or(2, |n| n.get())
        .min(lines.len().max(1));
    let next = std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|s| {
        let speakers: Vec<_> = (0..workers)
            .map(|_| {
                s.spawn(|| loop {
                    let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let Some(line) = lines.get(i) else {
                        return Ok::<_, anyhow::Error>(());
                    };
                    synth.speak(&line.text, &voice_of(line), &part(i))?;
                })
            })
            .collect();
        speakers
            .into_iter()
            .try_for_each(|h| h.join().expect("speech thread panicked"))
    })?;

    for (i, line) in lines.iter().enumerate() {
        let mut reader = hound::WavReader::open(part(i)).context("Unreadable speech audio")?;
        let spec = reader.spec();
        let w = match writer.as_mut() {
            Some(w) => {
                if spec.sample_rate != sample_rate || spec.channels != channels {
                    bail!("Speech audio changed format mid-recap");
                }
                // The pause before every line but the first.
                let gap = (sample_rate as u64 * GAP_MS as u64 / 1000) * channels as u64;
                for _ in 0..gap {
                    w.write_sample(0i16)?;
                }
                written += gap;
                w
            }
            None => {
                sample_rate = spec.sample_rate;
                channels = spec.channels;
                writer.insert(hound::WavWriter::create(
                    &partial,
                    hound::WavSpec {
                        channels,
                        sample_rate,
                        bits_per_sample: 16,
                        sample_format: hound::SampleFormat::Int,
                    },
                )?)
            }
        };
        let to_ms = |samples: u64| (samples / channels as u64 * 1000 / sample_rate as u64) as i64;
        let start_ms = to_ms(written);
        for sample in reader.samples::<i16>() {
            w.write_sample(sample?)?;
            written += 1;
        }
        timed.push(RecapLine {
            voice: voice_of(line),
            start_ms,
            end_ms: to_ms(written),
            ..line.clone()
        });
    }
    writer
        .ok_or_else(|| anyhow!("Nothing to say"))?
        .finalize()?;
    std::fs::rename(&partial, out)?;
    Ok(timed)
}

/// Where a meeting's recap audio and script are cached, next to its
/// recording in `recordings_dir`.
pub fn recap_paths(recordings_dir: &Path, meeting_id: &str) -> (PathBuf, PathBuf) {
    (
        recordings_dir.join(format!("{meeting_id}.recap.wav")),
        recordings_dir.join(format!("{meeting_id}.recap.json")),
    )
}

/// Where the latest spoken answer for a meeting is kept.
pub fn answer_path(recordings_dir: &Path, meeting_id: &str) -> PathBuf {
    recordings_dir.join(format!("{meeting_id}.answer.wav"))
}

/// Removes a meeting's recap and answer audio.
pub fn delete_files(recordings_dir: &Path, meeting_id: &str) {
    let (wav, json) = recap_paths(recordings_dir, meeting_id);
    for path in [wav, json, answer_path(recordings_dir, meeting_id)] {
        let _ = std::fs::remove_file(path);
    }
}

/// The cached recap, if both its audio and script are still there.
pub fn load(recordings_dir: &Path, meeting_id: &str) -> Option<AudioRecap> {
    let (wav, json) = recap_paths(recordings_dir, meeting_id);
    if !wav.exists() {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(json).ok()?).ok()
}

/// Refuses a model that isn't on this Mac in local-only mode, and an empty
/// model choice, with a message saying what to do.
fn check_model(db: &Database, provider: &str, model: &str) -> Result<()> {
    if provider.is_empty() || model.is_empty() {
        bail!("Pick an AI model first (Settings → AI) to write the recap.");
    }
    if crate::llm::local_only_enabled(db) && !crate::llm::runs_locally(provider) {
        bail!(
            "Local-only mode is on, so only a local model (Ollama) can write the recap. Pick \
             one, or turn Local-only mode off in Settings → Privacy."
        );
    }
    Ok(())
}

fn transcript_for(db: &Database, meeting_id: &str) -> Result<Vec<TranscriptSegment>> {
    let segments = db.get_transcript(meeting_id)?;
    if segments.is_empty() {
        bail!("This meeting has no transcript to recap.");
    }
    Ok(segments)
}

/// Writes a recap script with the LLM, renders it in a voice per speaker,
/// and caches it, replacing any earlier one.
pub async fn generate(
    db: &Database,
    llm: &LlmRegistry,
    synth: Arc<dyn SpeechSynth>,
    recordings_dir: &Path,
    meeting_id: &str,
    provider: &str,
    model: &str,
) -> Result<AudioRecap> {
    check_model(db, provider, model)?;
    crate::llm::sync_local_only(db);
    let meeting = db.get_meeting(meeting_id)?;
    let segments = transcript_for(db, meeting_id)?;
    let speakers = speakers_in_order(&segments);

    let started = std::time::Instant::now();
    let llm_provider = llm
        .get_provider(provider)
        .ok_or_else(|| anyhow!("Provider '{provider}' not found"))?;
    let transcript = crate::summarization::condense_for(
        llm_provider,
        model,
        crate::summarization::llm_transcript(db, meeting_id, &segments),
    )
    .await?;
    let messages = script_messages(
        &meeting.title,
        &speakers,
        &transcript,
        &crate::dictionary::glossary(db),
    );
    let raw = llm_provider.chat(messages, model).await?;
    let lines = parse_script(&raw, &speakers);
    if lines.is_empty() {
        bail!("The AI's recap script couldn't be read. Try Regenerate, or another model.");
    }
    let script_ms = started.elapsed().as_millis();

    let (wav, json) = recap_paths(recordings_dir, meeting_id);
    let audio_path = wav.to_string_lossy().into_owned();
    std::fs::create_dir_all(recordings_dir)?;
    let lines = tokio::task::spawn_blocking(move || {
        let voices = pick_voices(&synth.voices().unwrap_or_default(), &speakers);
        render(synth.as_ref(), &lines, &voices, &wav)
    })
    .await??;
    tracing::info!(
        "Audio recap for {meeting_id}: {} lines, script {script_ms} ms, total {} ms",
        lines.len(),
        started.elapsed().as_millis()
    );

    let recap = AudioRecap {
        meeting_id: meeting_id.to_string(),
        audio_path,
        lines,
        provider: provider.to_string(),
        model: model.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    std::fs::write(json, serde_json::to_string(&recap)?)?;
    Ok(recap)
}

/// Answers a question about the meeting with the meeting chat, and speaks
/// the answer in the voice of whoever it's mostly drawn from: the same
/// voice they had in the recap, when there is one.
#[allow(clippy::too_many_arguments)]
pub async fn ask(
    db: &Database,
    llm: &LlmRegistry,
    synth: Arc<dyn SpeechSynth>,
    recordings_dir: &Path,
    meeting_id: &str,
    question: &str,
    provider: &str,
    model: &str,
) -> Result<RoomAnswer> {
    check_model(db, provider, model)?;
    crate::llm::sync_local_only(db);
    let question = question.trim();
    if question.is_empty() {
        bail!("Type a question to ask the room.");
    }
    let speakers = speakers_in_order(&transcript_for(db, meeting_id)?);
    let raw = crate::summarization::chat_with_transcript(
        db,
        llm,
        meeting_id,
        &format!("{question}{}", answer_instructions(&speakers)),
        Vec::new(),
        provider,
        model,
    )
    .await?;
    let line = parse_answer(&raw, &speakers);
    if line.text.is_empty() {
        bail!("The AI didn't answer. Try asking another way.");
    }

    let recap_voices: HashMap<String, String> = load(recordings_dir, meeting_id)
        .map(|r| r.lines.into_iter().map(|l| (l.speaker, l.voice)).collect())
        .unwrap_or_default();
    let out = answer_path(recordings_dir, meeting_id);
    std::fs::create_dir_all(recordings_dir)?;
    let audio_path = out.to_string_lossy().into_owned();
    let line = tokio::task::spawn_blocking(move || {
        let voices = if recap_voices.contains_key(&line.speaker) {
            recap_voices
        } else {
            pick_voices(&synth.voices().unwrap_or_default(), &speakers)
        };
        render(synth.as_ref(), std::slice::from_ref(&line), &voices, &out)
    })
    .await??
    .remove(0);
    Ok(RoomAnswer { line, audio_path })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reads_json_lines_with_fences_and_chatter() {
        let raw = "Sure! Here's the script:\n```json\n\
                   {\"speaker\": \"Narrator\", \"text\": \"Welcome to the recap.\"},\n\
                   {\"speaker\": \"alice\", \"text\": \"I'll ship Friday.\"}\n\
                   {\"speaker\": \"Bob\", \"text\": \"  \"}\n\
                   ```";
        let lines = parse_script(raw, &names(&["Alice", "Bob"]));
        assert_eq!(lines.len(), 2, "blank lines and chatter are dropped");
        assert_eq!(lines[0].speaker, NARRATOR);
        assert_eq!(lines[1].speaker, "Alice", "case is matched to the meeting");
        assert_eq!(lines[1].text, "I'll ship Friday.");
    }

    #[test]
    fn reads_a_json_array_or_wrapped_object() {
        let speakers = names(&["Alice"]);
        let array = r#"[{"speaker":"Alice","text":"One."},{"name":"Narrator","line":"Two."}]"#;
        assert_eq!(parse_script(array, &speakers).len(), 2);
        let wrapped = r#"{"lines":[{"speaker":"Alice","text":"One."}]}"#;
        assert_eq!(parse_script(wrapped, &speakers)[0].speaker, "Alice");
    }

    #[test]
    fn falls_back_to_name_colon_lines() {
        let raw = "Narrator: Here's the recap.\n- Alice Chen: We agreed on May.\n\
                   This sentence has a colon: but is too long to be a speaker label here.";
        let lines = parse_script(raw, &names(&["Alice Chen"]));
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1].speaker, "Alice Chen");
        assert_eq!(lines[1].text, "We agreed on May.");
    }

    #[test]
    fn unknown_speakers_go_to_the_narrator_and_first_names_match() {
        let speakers = names(&["Alice Chen", "Bob Smith", "Bob Jones"]);
        assert_eq!(match_speaker("Alice", &speakers), "Alice Chen");
        assert_eq!(match_speaker("Bob", &speakers), NARRATOR, "ambiguous");
        assert_eq!(match_speaker("Carol", &speakers), NARRATOR);
        assert_eq!(match_speaker("**Bob Jones**", &speakers), "Bob Jones");
    }

    #[test]
    fn an_answer_in_the_wrong_format_is_read_by_the_narrator() {
        let speakers = names(&["Alice"]);
        let answer = parse_answer(r#"{"speaker":"Alice","text":"I said May."}"#, &speakers);
        assert_eq!(
            (answer.speaker.as_str(), answer.text.as_str()),
            ("Alice", "I said May.")
        );
        let plain = parse_answer("The launch moved to May.", &speakers);
        assert_eq!(plain.speaker, NARRATOR);
        assert_eq!(plain.text, "The launch moved to May.");
    }

    #[test]
    fn prompt_names_the_speakers_in_order_and_the_format() {
        let messages = script_messages(
            "Weekly sync",
            &names(&["Bob", "Alice"]),
            "[00:00] Bob: hi",
            "",
        );
        assert_eq!(messages.len(), 2);
        assert!(messages[0]
            .content
            .contains("in the order they spoke: Bob, Alice."));
        assert!(messages[0].content.contains("\"speaker\""));
        assert!(messages[1].content.contains("Meeting: Weekly sync"));
        assert!(messages[1].content.contains("[00:00] Bob: hi"));
        assert!(answer_instructions(&names(&["Bob"])).contains("(Bob)"));
    }

    #[test]
    fn speakers_are_listed_by_first_appearance() {
        let seg = |speaker: &str| TranscriptSegment {
            id: String::new(),
            meeting_id: String::new(),
            speaker_label: speaker.into(),
            text: String::new(),
            start_ms: 0,
            end_ms: 0,
            confidence: 1.0,
        };
        let segments = [seg("Bob"), seg("Alice"), seg("Bob"), seg("Carol")];
        assert_eq!(
            speakers_in_order(&segments),
            names(&["Bob", "Alice", "Carol"])
        );
    }

    #[test]
    fn parses_say_voice_list() {
        let out = "Albert              en_US    # Hello! My name is Albert.\n\
                   Eddy (English (US)) en_US    # Hello! My name is Eddy.\n\
                   Amélie              fr_CA    # Bonjour! Je m’appelle Amélie.\n\
                   garbage line\n";
        let voices = parse_say_voices(out);
        assert_eq!(voices.len(), 3);
        assert_eq!(voices[1].name, "Eddy (English (US))");
        assert_eq!(voices[1].locale, "en_US");
    }

    #[test]
    fn picks_distinct_natural_voices_with_the_narrator_first() {
        let voice = |name: &str, locale: &str| Voice {
            name: name.into(),
            locale: locale.into(),
        };
        let installed = [
            voice("Zarvox", "en_US"),
            voice("Fred", "en_US"),
            voice("Daniel", "en_GB"),
            voice("Samantha", "en_US"),
            voice("Samantha (Enhanced)", "en_US"),
            voice("Thomas", "fr_FR"),
        ];
        let picked = pick_voices(&installed, &names(&["Alice", "Bob", "Carol"]));
        assert_eq!(picked[NARRATOR], "Samantha (Enhanced)");
        assert_eq!(picked["Alice"], "Daniel");
        assert_eq!(picked["Bob"], "Fred");
        assert_eq!(picked["Carol"], "Daniel", "reused, never the narrator's");
        assert!(!picked
            .values()
            .any(|v| v == "Zarvox" || v == "Thomas" || v == "Samantha"));

        let none = pick_voices(&[], &names(&["Alice"]));
        assert_eq!(
            none["Alice"], "",
            "the system voice when nothing is installed"
        );
    }

    /// Writes a tone whose length depends on the text, so timings can be
    /// checked, and remembers which voice said what.
    struct FakeSynth(std::sync::Mutex<Vec<(String, String)>>);

    impl SpeechSynth for FakeSynth {
        fn voices(&self) -> Result<Vec<Voice>> {
            Ok(vec![])
        }
        fn speak(&self, text: &str, voice: &str, out: &Path) -> Result<()> {
            self.0.lock().unwrap().push((voice.into(), text.into()));
            let spec = hound::WavSpec {
                channels: 1,
                sample_rate: 1000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let mut w = hound::WavWriter::create(out, spec)?;
            for _ in 0..text.len() * 100 {
                w.write_sample(1000i16)?;
            }
            w.finalize()?;
            Ok(())
        }
    }

    #[test]
    fn renders_lines_into_one_file_with_timings() {
        let dir = tempfile::tempdir().unwrap();
        let (out, _) = recap_paths(dir.path(), "m1");
        let line = RecapLine::new;
        let voices = HashMap::from([
            (NARRATOR.to_string(), "Samantha".to_string()),
            ("Alice".to_string(), "Daniel".to_string()),
        ]);
        let synth = FakeSynth(Default::default());
        let lines = render(
            &synth,
            &[line(NARRATOR, "Hi"), line("Alice", "Yes")],
            &voices,
            &out,
        )
        .unwrap();

        // 2 chars → 200 ms, 400 ms pause, 3 chars → 300 ms.
        assert_eq!((lines[0].start_ms, lines[0].end_ms), (0, 200));
        assert_eq!((lines[1].start_ms, lines[1].end_ms), (600, 900));
        assert_eq!(lines[1].voice, "Daniel");
        assert!(synth
            .0
            .lock()
            .unwrap()
            .contains(&("Samantha".into(), "Hi".into())));
        assert_eq!(hound::WavReader::open(&out).unwrap().duration(), 900);
        assert!(
            !out.with_extension("parts").exists(),
            "parts are cleaned up"
        );

        let (wav, json) = recap_paths(dir.path(), "m1");
        std::fs::write(&json, "{}").unwrap();
        std::fs::write(answer_path(dir.path(), "m1"), "").unwrap();
        delete_files(dir.path(), "m1");
        assert!(!wav.exists() && !json.exists() && !answer_path(dir.path(), "m1").exists());
    }

    #[test]
    fn refuses_hosted_models_in_local_only_mode_and_no_model() {
        let db = Database::new_in_memory().unwrap();
        assert!(check_model(&db, "", "").is_err());
        assert!(check_model(&db, "anthropic", "claude").is_ok());
        db.set_setting(crate::llm::LOCAL_ONLY_SETTING, "true")
            .unwrap();
        let err = check_model(&db, "anthropic", "claude")
            .unwrap_err()
            .to_string();
        assert!(err.contains("Local-only mode"));
        assert!(check_model(&db, "ollama", "llama3").is_ok());
    }
}
