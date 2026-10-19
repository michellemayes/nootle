// Reads the Markdown the Nootle app shares (see src-tauri/src/export.rs,
// `to_markdown`): `# Title`, a "when" line, the summaries, action items and
// notes, and the transcript last as `**[mm:ss] Speaker:** text` lines.

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export interface ParsedNote {
  title: string;
  /** "Monday, October 19, 2026", "10:30 AM", "13 min", when present. */
  date?: string;
  time?: string;
  duration?: string;
  /** Everything between the header and the transcript. */
  body: string;
  /** Null when the note was shared without its transcript. */
  transcript: { lines: TranscriptLine[]; markdown: string } | null;
  actionItems: number;
}

const TRANSCRIPT_HEADING = /^## Transcript[ \t]*$/gm;
const TRANSCRIPT_LINE = /^\*\*\[([\d:]+)\] (.+?):\*\*\s?(.*)$/;
const TASK = /^\s*[-*] \[[ xX]\] /gm;

export function parseNote(markdown: string): ParsedNote {
  let rest = markdown.replace(/\r\n/g, "\n").trim();

  let title = "Meeting notes";
  const heading = rest.match(/^# (.+)\n*/);
  if (heading) {
    title = heading[1].trim();
    rest = rest.slice(heading[0].length);
  }

  // The "when" line: "Monday, October 19, 2026 at 10:30 AM · 13 min".
  let date: string | undefined, time: string | undefined, duration: string | undefined;
  const when = rest.match(/^([^#\n][^\n]*)\n*/);
  if (when && /\d{4}/.test(when[1]) && when[1].length < 120) {
    const [moment, length] = when[1].split(" · ");
    [date, time] = moment.split(" at ");
    duration = length;
    rest = rest.slice(when[0].length);
  }

  // The app writes the transcript last, so the last such heading is it.
  let transcript: ParsedNote["transcript"] = null;
  const at = [...rest.matchAll(TRANSCRIPT_HEADING)].pop()?.index;
  if (at !== undefined) {
    const section = rest.slice(at).replace(TRANSCRIPT_HEADING, "").trim();
    rest = rest.slice(0, at);
    const lines = section
      .split(/\n+/)
      .map((l) => l.match(TRANSCRIPT_LINE))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map(([, time, speaker, text]) => ({ time, speaker, text }));
    transcript = { lines, markdown: section };
  }

  return {
    title,
    date,
    time,
    duration,
    body: rest.trim(),
    transcript,
    actionItems: rest.match(TASK)?.length ?? 0,
  };
}

/** Longest prompt put in a chat link; percent-encoding can triple it. */
const PROMPT_MAX_CHARS = 5_000;
const INTRO = "Here are notes from a meeting, shared with me from Nootle:\n\n";
const OUTRO = "\n\nRead them, then help me with questions and follow-ups about this meeting.";

/**
 * A first message for an AI chat about these notes: the whole note when it
 * fits in a link, else without the transcript, else trimmed. `trimmed` says
 * whether anything was left out, so the caller can offer the rest.
 */
export function chatPrompt(markdown: string, note: ParsedNote): { prompt: string; trimmed: boolean } {
  const budget = PROMPT_MAX_CHARS - INTRO.length - OUTRO.length;
  const full = markdown.trim();
  if (full.length <= budget) return { prompt: INTRO + full + OUTRO, trimmed: false };

  const notes = `# ${note.title}\n\n${note.body}`;
  if (notes.length <= budget) return { prompt: INTRO + notes + OUTRO, trimmed: true };

  const marker = "\n\n…(trimmed)";
  const cut = notes.slice(0, budget - marker.length);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), cut.length - 40));
  return { prompt: INTRO + atWord + marker + OUTRO, trimmed: true };
}

/** "Mitchell Taylor" → "MT". */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
