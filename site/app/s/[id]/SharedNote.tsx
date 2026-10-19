"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; markdown: string };

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
  if (!resp.ok) return { status: "error", message: "Couldn't load this note. Try again in a moment." };
  const { iv, ciphertext } = (await resp.json()) as { iv: string; ciphertext: string };
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", fromBase64Url(key), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(iv) },
      cryptoKey,
      fromBase64Url(ciphertext),
    );
    return { status: "ready", markdown: new TextDecoder().decode(plain) };
  } catch {
    return { status: "error", message: "This link's key doesn't match the note. Check that you copied the whole link." };
  }
}

export function SharedNote({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    openNote(id, window.location.hash.slice(1))
      .then((next) => {
        setState(next);
        const title = next.status === "ready" && next.markdown.match(/^# (.+)$/m)?.[1];
        if (title) document.title = `${title} - Nootle`;
      })
      .catch(() => setState({ status: "error", message: "Couldn't load this note. Try again in a moment." }));
  }, [id]);

  return (
    <main id="main-content" className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10 flex items-center justify-between text-sm text-[var(--color-text-secondary)]">
          <Link href="/" className="font-[family-name:var(--font-outfit)] font-semibold text-[var(--color-text)]">
            Nootle
          </Link>
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Shared notes · private, end-to-end encrypted
          </span>
        </header>

        {state.status === "loading" && <p className="text-[var(--color-text-secondary)]">Decrypting…</p>}
        {state.status === "error" && <p className="text-[var(--color-text-secondary)]">{state.message}</p>}
        {state.status === "ready" && (
          <article className="shared-note">
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
              {state.markdown}
            </ReactMarkdown>
          </article>
        )}

        <footer className="mt-16 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-text-secondary)]">
          Recorded and summarized with{" "}
          <Link href="/" className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]">
            Nootle
          </Link>
          , the free, local-first AI meeting notetaker for Mac.
        </footer>
      </div>
    </main>
  );
}
