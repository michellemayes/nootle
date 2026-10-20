//! Reads transcripts exported from other meeting tools (Otter, Fathom,
//! Granola, Zoom, Teams, Meet), so moving to Nootle brings your history
//! along. Understands subtitle files (SRT, WebVTT) and the common plain-text
//! layouts; anything else is read as one line per speaker turn.

use std::path::Path;

/// Transcript file types `parse` reads.
pub const EXTENSIONS: &[&str] = &["srt", "vtt", "txt", "md"];

/// One line of an imported transcript.
#[derive(Debug, Clone, PartialEq)]
pub struct ImportedLine {
    pub speaker: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// Whether `path` looks like a transcript rather than audio.
pub fn is_transcript(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Parses a transcript; lines without timing are spaced 5 s apart so they
/// keep their order.
pub fn parse(content: &str) -> Vec<ImportedLine> {
    let content = content.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let mut lines = if content.contains("-->") {
        parse_cues(&content)
    } else {
        parse_plain(&content)
    };
    lines.retain(|l| !l.text.trim().is_empty());
    for i in 0..lines.len() {
        if lines[i].end_ms <= lines[i].start_ms {
            let next = lines.get(i + 1).map(|n| n.start_ms);
            lines[i].end_ms = next
                .filter(|&n| n > lines[i].start_ms)
                .unwrap_or(lines[i].start_ms + 5_000);
        }
    }
    lines
}

/// SRT / WebVTT: timing lines `00:01:02,500 --> 00:01:05,000`, with the
/// speaker as `<v Name>` or a `Name:` prefix.
fn parse_cues(content: &str) -> Vec<ImportedLine> {
    let mut out = Vec::new();
    let mut lines = content.lines().peekable();
    while let Some(line) = lines.next() {
        let Some((start, end)) = line.split_once("-->") else {
            continue;
        };
        let (Some(start_ms), Some(end_ms)) = (timestamp_ms(start), timestamp_ms(end)) else {
            continue;
        };
        let mut text = Vec::new();
        while let Some(next) = lines.peek() {
            if next.trim().is_empty() {
                break;
            }
            text.push(lines.next().unwrap_or_default().trim());
        }
        let joined = text.join(" ");
        let (speaker, text) = match joined.strip_prefix("<v ") {
            Some(rest) => match rest.split_once('>') {
                Some((name, said)) => (name.trim().to_string(), strip_tags(said)),
                None => (String::new(), strip_tags(&joined)),
            },
            None => split_speaker(&strip_tags(&joined)),
        };
        out.push(ImportedLine {
            speaker: or_unknown(speaker),
            text,
            start_ms,
            end_ms,
        });
    }
    merge_runs(out)
}

/// Plain text. Recognises a header line naming the speaker and time with the
/// words on the following lines (Otter: `Priya  0:42`, Fathom: `0:42 - Priya`),
/// and single lines like `[0:42] Priya: words`, `Priya (0:42): words` or
/// `Priya: words`.
fn parse_plain(content: &str) -> Vec<ImportedLine> {
    let mut out: Vec<ImportedLine> = Vec::new();
    let mut header: Option<(String, i64)> = None;
    let mut last_ms = -5_000;
    for raw in content.lines() {
        let line = raw.trim().trim_start_matches(['-', '*', '>']).trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((speaker, ms)) = speaker_time_header(line) {
            header = Some((speaker, ms));
            continue;
        }
        let (speaker, ms, text) = match header.as_ref() {
            Some((speaker, ms)) => (speaker.clone(), Some(*ms), line.to_string()),
            None => {
                let (ms, rest) = leading_timestamp(line);
                let (speaker, text) = split_speaker(rest);
                let (speaker, ms) = match speaker.split_once(" (") {
                    // `Priya (0:42): words`
                    Some((name, time)) => match timestamp_ms(time.trim_end_matches(')')) {
                        Some(t) => (name.to_string(), Some(t)),
                        None => (speaker.clone(), ms),
                    },
                    None => (speaker, ms),
                };
                (speaker, ms, text)
            }
        };
        let start_ms = ms.unwrap_or(last_ms + 5_000);
        // Text under one header continues the same turn.
        match out.last_mut() {
            Some(prev) if header.is_some() && prev.start_ms == start_ms => {
                prev.text.push(' ');
                prev.text.push_str(&text);
            }
            _ => out.push(ImportedLine {
                speaker: or_unknown(speaker),
                text,
                start_ms,
                end_ms: 0,
            }),
        }
        last_ms = start_ms;
    }
    out
}

/// `Priya  0:42`, `Priya 00:00:42`, `0:42 - Priya`, `Priya - 0:42`.
fn speaker_time_header(line: &str) -> Option<(String, i64)> {
    if line.contains(':') && line.split_whitespace().count() > 6 {
        return None;
    }
    let words: Vec<&str> = line
        .split_whitespace()
        .filter(|w| *w != "-" && *w != "·")
        .collect();
    let (first, last) = (words.first()?, words.last()?);
    if words.len() < 2 {
        return None;
    }
    let (name, ms) = if let Some(ms) = timestamp_ms(last) {
        (words[..words.len() - 1].join(" "), ms)
    } else {
        (words[1..].join(" "), timestamp_ms(first)?)
    };
    // "Sam: see you at 3:00" is a line of speech, not a header.
    (!name.contains(':')).then_some((name, ms))
}

/// A leading `[0:42]` or `0:42` and the rest of the line.
fn leading_timestamp(line: &str) -> (Option<i64>, &str) {
    let trimmed = line.trim_start_matches('[');
    let end = trimmed
        .find(|c: char| !(c.is_ascii_digit() || c == ':' || c == '.' || c == ','))
        .unwrap_or(trimmed.len());
    match timestamp_ms(&trimmed[..end]) {
        Some(ms) => (
            Some(ms),
            trimmed[end..].trim_start_matches([']', ' ', '-', '|']),
        ),
        None => (None, line),
    }
}

/// `Name: words`, when the part before the colon looks like a name.
fn split_speaker(line: &str) -> (String, String) {
    if let Some((name, said)) = line.split_once(": ") {
        let name = name.trim();
        if !name.is_empty() && name.len() <= 40 && name.split_whitespace().count() <= 4 {
            return (name.to_string(), said.trim().to_string());
        }
    }
    (String::new(), line.trim().to_string())
}

/// `1:02`, `01:02:03`, `00:01:02,500`, `00:01:02.500`.
pub fn timestamp_ms(s: &str) -> Option<i64> {
    let s = s.trim().trim_matches(['[', ']', '(', ')']);
    let (clock, millis) = match s.split_once([',', '.']) {
        // ".5" is half a second: pad the fraction to milliseconds.
        Some((c, m)) => (c, format!("{m:0<3}").get(..3)?.parse::<i64>().ok()?),
        None => (s, 0),
    };
    let parts: Vec<i64> = clock
        .split(':')
        .map(|p| p.parse::<i64>().ok())
        .collect::<Option<_>>()?;
    let seconds = match parts.as_slice() {
        [m, s] if *s < 60 => m * 60 + s,
        [h, m, s] if *m < 60 && *s < 60 => h * 3600 + m * 60 + s,
        _ => return None,
    };
    Some(seconds * 1000 + millis)
}

fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.trim().to_string()
}

fn or_unknown(speaker: String) -> String {
    if speaker.trim().is_empty() {
        crate::diarization::UNKNOWN_LABEL.to_string()
    } else {
        speaker.trim().to_string()
    }
}

/// Subtitle files split sentences across cues; consecutive cues by the same
/// speaker become one line until a sentence ends.
fn merge_runs(lines: Vec<ImportedLine>) -> Vec<ImportedLine> {
    let mut out: Vec<ImportedLine> = Vec::new();
    for line in lines {
        match out.last_mut() {
            Some(prev)
                if prev.speaker == line.speaker
                    && !prev.text.ends_with(['.', '?', '!'])
                    && line.start_ms - prev.end_ms < 2_000 =>
            {
                prev.text.push(' ');
                prev.text.push_str(&line.text);
                prev.end_ms = line.end_ms;
            }
            _ => out.push(line),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(lines: &[ImportedLine]) -> Vec<(String, i64, String)> {
        lines
            .iter()
            .map(|l| (l.speaker.clone(), l.start_ms, l.text.clone()))
            .collect()
    }

    #[test]
    fn reads_srt_with_speaker_prefixes() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nPriya: We should ship\n\n2\n00:00:03,600 --> 00:00:05,000\nPriya: on Friday.\n\n3\n00:00:06,000 --> 00:00:08,000\nSam: Agreed.\n";
        assert_eq!(
            summary(&parse(srt)),
            [
                ("Priya".into(), 1_000, "We should ship on Friday.".into()),
                ("Sam".into(), 6_000, "Agreed.".into()),
            ]
        );
    }

    #[test]
    fn reads_webvtt_voice_tags() {
        let vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Priya Patel>Hello <b>all</b>.</v>\n";
        let lines = parse(vtt);
        assert_eq!(lines[0].speaker, "Priya Patel");
        assert_eq!(lines[0].text, "Hello all.");
        assert_eq!((lines[0].start_ms, lines[0].end_ms), (1_000, 2_000));
    }

    #[test]
    fn reads_otter_style_headers() {
        let otter =
            "Priya Patel  0:03\nThanks for joining.\nLet's start.\n\nSam  1:15\nSure thing.\n";
        assert_eq!(
            summary(&parse(otter)),
            [
                (
                    "Priya Patel".into(),
                    3_000,
                    "Thanks for joining. Let's start.".into()
                ),
                ("Sam".into(), 75_000, "Sure thing.".into()),
            ]
        );
    }

    #[test]
    fn reads_fathom_style_headers_and_inline_lines() {
        let fathom = "0:03 - Priya\nHello.\n\n0:09 - Sam\nHi!\n";
        assert_eq!(parse(fathom)[1].speaker, "Sam");
        assert_eq!(parse(fathom)[1].start_ms, 9_000);

        let inline = "[00:01:05] Priya: Budget is final.\nSam (1:10): Great.\n";
        assert_eq!(
            summary(&parse(inline)),
            [
                ("Priya".into(), 65_000, "Budget is final.".into()),
                ("Sam".into(), 70_000, "Great.".into()),
            ]
        );
    }

    #[test]
    fn untimed_lines_keep_their_order() {
        let granola = "# Weekly sync\n\nMe: Status?\nThem: All green.\n";
        let lines = parse(granola);
        assert_eq!(summary(&lines)[0], ("Me".into(), 0, "Status?".into()));
        assert_eq!(lines[1].start_ms, 5_000);
        assert!(lines.iter().all(|l| l.end_ms > l.start_ms));
    }

    #[test]
    fn prose_isnt_mistaken_for_speakers() {
        let lines = parse("Note: this is a long sentence that has a colon in the middle of it.\n");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].speaker, "Note");
        let lines =
            parse("We met at 10:30 to talk about the plan for the next quarter and more.\n");
        assert_eq!(lines[0].speaker, crate::diarization::UNKNOWN_LABEL);
        let lines = parse("Sam: see you at 3:00\n");
        assert_eq!(
            summary(&lines),
            [("Sam".into(), 0, "see you at 3:00".into())]
        );
    }

    #[test]
    fn timestamps() {
        assert_eq!(timestamp_ms("1:02"), Some(62_000));
        assert_eq!(timestamp_ms("01:02:03,250"), Some(3_723_250));
        assert_eq!(timestamp_ms("[00:00:05.5]"), Some(5_500));
        assert_eq!(timestamp_ms("1:99"), None);
        assert_eq!(timestamp_ms("Priya"), None);
    }
}
