"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  Copy,
  Download,
  KeyRound,
  Lock,
  MessageSquareText,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { DownloadButton } from "@/components/DownloadButton";
import { RELEASES_URL } from "@/components/site-config";
import { chatPrompt, initials, parseNote, type ParsedNote } from "./note";
import styles from "./shared-note.module.css";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; markdown: string; note: ParsedNote };

const LOAD_FAILED = "Couldn't load this note. Try again in a moment.";

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Fetches the encrypted note and decrypts it with the key in the link's #fragment. */
async function openNote(id: string, key: string): Promise<State> {
  if (!key) {
    return { status: "error", message: "This link is missing its key. Copy the whole link, including the part after #." };
  }
  const resp = await fetch(`/api/shares/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (resp.status === 404) {
    return { status: "error", message: "This note is no longer shared." };
  }
  if (!resp.ok) return { status: "error", message: LOAD_FAILED };
  const { iv, ciphertext } = (await resp.json()) as { iv: string; ciphertext: string };
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", fromBase64Url(key), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(iv) },
      cryptoKey,
      fromBase64Url(ciphertext),
    );
    const markdown = new TextDecoder().decode(plain);
    return { status: "ready", markdown, note: parseNote(markdown) };
  } catch {
    return { status: "error", message: "This link's key doesn't match the note. Check that you copied the whole link." };
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

/** The lock pill, with a popover explaining end-to-end encryption on hover or tap. */
function EncryptionInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  return (
    <div className={styles.lockInfo} ref={ref} data-open={open || undefined}>
      <button
        type="button"
        className={styles.lockPill}
        aria-expanded={open}
        aria-controls="encryption-info"
        aria-label="Private, end-to-end encrypted. What does this mean?"
        onClick={() => setOpen((o) => !o)}
      >
        <Lock aria-hidden="true" />
        <span className={styles.lockLong}>Private, end-to-end encrypted</span>
        <span className={styles.lockShort}>Encrypted</span>
      </button>
      <div id="encryption-info" role="region" aria-label="About end-to-end encryption" className={styles.lockPopover}>
        <div className={styles.lockCard}>
          <p className={styles.lockLead}>
            <KeyRound aria-hidden="true" />
            Only people with this link can read these notes. Not even nootle.ai can.
          </p>
          <p className={styles.lockHeading}>How it works</p>
          <ol className={styles.lockSteps}>
            <li>The sender&apos;s Mac encrypts the notes (AES-256-GCM) with a key made just for this link.</li>
            <li>
              nootle.ai stores only the scrambled copy. The key sits in the link after the <code>#</code>, a part
              browsers never send to a server.
            </li>
            <li>Your browser downloads the scrambled copy and unlocks it with the key, right here on this page.</li>
          </ol>
          <p className={styles.lockHeading}>Why</p>
          <p>
            Meeting notes are private. Encrypting them before they leave the Mac means only people holding the link
            can read them, and a breach of nootle.ai would expose nothing readable. Stop sharing deletes the copy.
          </p>
          <Link href="/privacy#share-links" className={styles.btnLink}>
            Read the privacy policy →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A slim strip above the notes for readers who don't know Nootle yet. */
function GetNootle() {
  return (
    <aside className={styles.getStrip}>
      <Image src="/nootle-icon.svg" alt="" width={20} height={20} />
      <p>
        Made with <strong>Nootle</strong>, the free AI notetaker for Mac. No bot joins your calls.
      </p>
      <a href={RELEASES_URL} className={styles.btnLink}>
        Get Nootle →
      </a>
    </aside>
  );
}

function Header() {
  return (
    <header className={styles.topbar}>
      <Link href="/" className={styles.brand}>
        <Image src="/nootle-icon.svg" alt="" width={28} height={28} priority />
        Nootle
      </Link>
      <div className={styles.topbarEnd}>
        <EncryptionInfo />
        <a href={RELEASES_URL} className={styles.getButton}>
          Get Nootle
        </a>
      </div>
    </header>
  );
}

function Hero({ note }: { note: ParsedNote }) {
  const chips = [
    note.date && { icon: Calendar, label: note.date },
    note.time && { icon: Clock, label: note.time },
    note.duration && { icon: Timer, label: note.duration },
    note.actionItems > 0 && { icon: CheckSquare, label: plural(note.actionItems, "action item") },
    note.transcript?.lines.length && { icon: MessageSquareText, label: "Transcript" },
  ].filter((c): c is { icon: LucideIcon; label: string } => Boolean(c));
  return (
    <section className={styles.hero}>
      <p className={styles.eyebrow}>Meeting notes</p>
      <h1 className={styles.title}>{note.title}</h1>
      {chips.length > 0 && (
        <ul className={styles.chips}>
          {chips.map(({ icon: Icon, label }) => (
            <li key={label} className={styles.chip}>
              <Icon aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CHATS = [
  { label: "Continue in Claude", url: "https://claude.ai/new?q=", Icon: SiClaude, className: styles.btnClaude },
  { label: "ChatGPT", url: "https://chatgpt.com/?q=", Icon: SiOpenai },
];

/** Buttons that take the notes into the reader's own AI chat, or out as Markdown. */
function AskAi({ markdown, note }: { markdown: string; note: ParsedNote }) {
  const [flash, setFlash] = useState<string | null>(null);
  const { q, trimmed } = useMemo(() => {
    const { prompt, trimmed } = chatPrompt(markdown, note);
    return { q: encodeURIComponent(prompt), trimmed };
  }, [markdown, note]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const copy = (message: string) =>
    navigator.clipboard.writeText(markdown).then(
      () => setFlash(message),
      () => setFlash("Couldn't copy. Select the text instead."),
    );

  // A link only holds so much: when the chat gets a shortened version, put
  // the whole note on the clipboard so it's one paste away.
  const onChat = () => {
    if (trimmed) copy("The full notes are on your clipboard too. Paste them in for everything.");
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `${note.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Meeting notes"}.md`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={styles.askAi} aria-label="Take these notes further">
      <div>
        <p className={styles.askTitle}>Talk these notes through with AI</p>
        <p className={styles.askText}>Ask follow-ups, draft the recap email, or turn decisions into tasks.</p>
      </div>
      <div className={styles.askButtons}>
        {CHATS.map(({ label, url, Icon, className }) => (
          <a
            key={label}
            className={`${styles.btn} ${className ?? ""}`}
            href={url + q}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onChat}
          >
            <Icon aria-hidden="true" />
            {label}
          </a>
        ))}
        <button type="button" className={styles.btn} onClick={() => copy("Copied as Markdown.")}>
          <Copy aria-hidden="true" />
          Copy
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnIcon}`} onClick={download} aria-label="Download as Markdown" title="Download as Markdown">
          <Download aria-hidden="true" />
        </button>
      </div>
      <p className={styles.flash} role="status">
        {flash && (
          <>
            <Check aria-hidden="true" />
            {flash}
          </>
        )}
      </p>
    </section>
  );
}

function Transcript({ transcript }: { transcript: NonNullable<ParsedNote["transcript"]> }) {
  const { lines, markdown } = transcript;
  // Each speaker keeps one color, in order of first appearance.
  const slots = useMemo(() => {
    const seen = new Map<string, number>();
    for (const l of lines) if (!seen.has(l.speaker)) seen.set(l.speaker, seen.size % 6);
    return seen;
  }, [lines]);
  // Long meetings have thousands of lines; build them only once opened.
  const [opened, setOpened] = useState(false);
  if (!lines.length && !markdown) return null;
  return (
    <details className={styles.transcript} onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>
        <MessageSquareText aria-hidden="true" className={styles.transcriptIcon} />
        <span className={styles.transcriptLabel}>
          <strong>Transcript</strong>
          {lines.length > 0 && (
            <span>
              {plural(lines.length, "line")} · {plural(slots.size, "speaker")}
            </span>
          )}
        </span>
        {lines.length > 0 && (
          <span className={styles.avatars} aria-hidden="true">
            {[...slots].slice(0, 4).map(([speaker, slot]) => (
              <span key={speaker} className={styles.avatar} data-slot={slot}>
                {initials(speaker)}
              </span>
            ))}
          </span>
        )}
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </summary>
      {!opened ? null : lines.length > 0 ? (
        <ol className={styles.lines}>
          {lines.map((l, i) => (
            <li key={i} className={styles.line}>
              <span className={styles.lineTime}>{l.time}</span>
              <span className={styles.lineSpeaker} data-slot={slots.get(l.speaker)}>
                {l.speaker}
              </span>
              <span className={styles.lineText}>{l.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className={`${styles.note} ${styles.transcriptRaw}`}>
          <Markdown>{markdown}</Markdown>
        </div>
      )}
    </details>
  );
}

const SHOT_SIZES = "(max-width: 720px) 100vw, 32rem";

function NootleCta() {
  return (
    <section className={styles.cta} aria-labelledby="cta-title">
      <div>
        <p className={styles.eyebrow}>Made with Nootle</p>
        <h2 id="cta-title" className={styles.ctaTitle}>
          Notes like these from every meeting. No bot in the call.
        </h2>
        <p className={styles.ctaText}>
          Nootle records your calls on your Mac, transcribes them on-device, and has the summary, action items and
          transcript ready when you hang up. Free and open source.
        </p>
        <ul className={styles.ctaPoints}>
          <li><Check aria-hidden="true" />Works with Zoom, Meet, Teams and Slack</li>
          <li><Check aria-hidden="true" />Transcription stays on your Mac</li>
          <li><Check aria-hidden="true" />Share notes like this in one click</li>
        </ul>
        <div className={styles.ctaButtons}>
          <DownloadButton />
          <Link href="/" className={styles.btnLink}>
            See how it works →
          </Link>
        </div>
      </div>
      <picture className={styles.ctaShot}>
        <source
          media="(prefers-color-scheme: dark)"
          srcSet="/screenshots/meeting-dark-800.webp 800w, /screenshots/meeting-dark-1600.webp 1600w"
          sizes={SHOT_SIZES}
        />
        <img
          src="/screenshots/meeting-light-1600.webp"
          srcSet="/screenshots/meeting-light-800.webp 800w, /screenshots/meeting-light-1600.webp 1600w"
          sizes={SHOT_SIZES}
          alt="A meeting in Nootle: transcript beside its summary"
          width={1600}
          height={1060}
          loading="lazy"
        />
      </picture>
    </section>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Decrypting notes">
      <div className={styles.skelTitle} />
      <div className={styles.skelChips} />
      {[92, 100, 84, 96, 60].map((w, i) => (
        <div key={i} className={styles.skelLine} style={{ width: `${w}%` }} />
      ))}
      <p className={styles.skelText}>
        <Lock aria-hidden="true" />
        Decrypting in your browser…
      </p>
    </div>
  );
}

export function SharedNote({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    openNote(id, window.location.hash.slice(1))
      .then(setState)
      .catch(() => setState({ status: "error", message: LOAD_FAILED }));
  }, [id]);

  useEffect(() => {
    if (state.status === "ready") document.title = `${state.note.title} - Nootle`;
  }, [state]);

  return (
    <div className={styles.page}>
      <Header />
      <main id="main-content" className={styles.main}>
        {state.status === "loading" && <Skeleton />}
        {state.status === "error" && (
          <div className={styles.error}>
            <Lock aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        )}
        {state.status === "ready" && <GetNootle />}
        {state.status === "ready" && (
          <article className={styles.paper}>
            <Hero note={state.note} />
            <AskAi markdown={state.markdown} note={state.note} />
            {state.note.body && (
              <div className={styles.note}>
                <Markdown>{state.note.body}</Markdown>
              </div>
            )}
            {state.note.transcript && <Transcript transcript={state.note.transcript} />}
          </article>
        )}
        {state.status !== "loading" && <NootleCta />}
      </main>
      <footer className={styles.footer}>
        <Lock aria-hidden="true" />
        Encrypted on the sender&apos;s Mac. The key lives only in this link, so nootle.ai can&apos;t read these notes.
      </footer>
    </div>
  );
}
