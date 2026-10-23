import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Privacy Policy - Nootle",
  description:
    "Nootle's privacy policy. Learn how Nootle handles your data locally and privately — no cloud recording, no data collection.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" className="relative pt-24 pb-16 px-6">
        <article className="max-w-2xl mx-auto prose prose-invert">
          <h1 className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold mb-8 text-[var(--color-text)]">
            Privacy Policy
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm mb-12">
            Last updated: October 15, 2026
          </p>

          <section className="space-y-6 text-[var(--color-text-secondary)] text-base leading-relaxed">
            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Overview
              </h2>
              <p>
                Nootle is a local-first AI meeting recorder for Mac. Your privacy is
                fundamental to how Nootle is built. All audio recording, transcription,
                and processing happens entirely on your Mac. No meeting data is sent to
                external servers by Nootle, except notes you choose to share, which are
                encrypted first (see Share links below).
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Data that stays on your Mac
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Meeting audio recordings</li>
                <li>Transcripts and speaker identification data</li>
                <li>AI-generated summaries, action items, and insights</li>
                <li>Meeting search index</li>
                <li>Your application preferences and settings</li>
              </ul>
              <p className="mt-4">
                This data is stored locally on your Mac&apos;s file system and is never
                uploaded to any cloud service by Nootle. You have full control over this
                data and can delete it at any time.
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                System permissions
              </h2>
              <p>Nootle requires the following macOS permissions to function:</p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>
                  <strong className="text-[var(--color-text)]">Microphone access</strong> — to
                  capture your microphone audio during meetings.
                </li>
                <li>
                  <strong className="text-[var(--color-text)]">Screen Recording</strong> — to
                  capture system audio output from meeting applications. Nootle does not
                  record your screen visually.
                </li>
              </ul>
              <p className="mt-4">
                These permissions are used solely for meeting recording and transcription.
                You can revoke these permissions at any time in System Settings.
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                AI features and API keys
              </h2>
              <p>
                Nootle&apos;s AI chat, summary, and insight features use your own API keys
                to communicate with your chosen AI provider (OpenAI, Anthropic, Google,
                Groq, or Ollama). When you use these features, relevant transcript context
                is sent to the provider you selected. Nootle does not operate its own AI
                servers and has no access to your API keys beyond your local machine.
              </p>
              <p className="mt-4">
                If you use a local AI model via Ollama, no data leaves your Mac at all.
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Integrations
              </h2>
              <p>
                When you configure integrations (Slack, Notion, Linear, etc.), Nootle
                sends meeting summaries and action items to those services at your
                direction. This data transfer only happens when you explicitly trigger it
                or configure automatic workflows. Nootle does not send data to any
                integration without your configuration.
              </p>
            </div>

            <div id="share-links" className="scroll-mt-24">
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Share links
              </h2>
              <p>
                When you share a meeting, the Nootle app encrypts its notes (AES-256-GCM)
                on your Mac before uploading them to nootle.ai. The key is only in the
                share link, after the <code>#</code>, and browsers never send that part
                of a link to a server. So nootle.ai and Vercel, which hosts it, store
                only encrypted data they can&apos;t read. Anyone you give the link to can
                read the note in their browser.
              </p>
              <p className="mt-4">
                Share pages don&apos;t load any analytics. Clicking Stop sharing in the
                app, or deleting the meeting, deletes the encrypted note from nootle.ai.
              </p>
            </div>

            <div id="ai-connector" className="scroll-mt-24">
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                AI connector
              </h2>
              <p>
                If you turn on the AI connector, Claude, ChatGPT or another AI app you
                connect can read the shared notes you choose for it. The app encrypts the
                list of those notes, with their keys, under a key that only your private
                connector link holds. Your AI app sends that link with each request, so
                nootle.ai decrypts those notes in memory only to answer it, then forgets
                them. Keys and decrypted notes are never stored, though, like any web
                request, the link may appear in short-lived request logs. Notes you
                don&apos;t choose for the connector stay unreadable to nootle.ai.
                Resetting or turning off the connector in the app stops the old link
                working.
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Website analytics
              </h2>
              <p>
                The nootle.ai website uses{" "}
                <a
                  href="https://vercel.com/docs/analytics/privacy-policy"
                  className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
                >
                  Vercel Analytics
                </a>{" "}
                to collect anonymous, aggregated usage data such as page views and visitor
                counts. No cookies are used, no personal data is collected, and no
                cross-site tracking occurs. This analytics data is used solely to
                understand how the website is used.
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Open source
              </h2>
              <p>
                Nootle is open source under the MIT license. You can inspect the full
                source code on{" "}
                <a
                  href="https://github.com/michellemayes/nootle"
                  className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
                >
                  GitHub
                </a>{" "}
                to verify these privacy practices.
              </p>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-4 text-[var(--color-text)]">
                Contact
              </h2>
              <p>
                If you have questions about this privacy policy, you can reach out via{" "}
                <a
                  href="https://github.com/michellemayes/nootle/issues"
                  className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
                >
                  GitHub Issues
                </a>{" "}
                or at{" "}
                <a
                  href="https://michellemayes.me"
                  className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
                >
                  michellemayes.me
                </a>
                .
              </p>
            </div>
          </section>
        </article>
      </main>
    </>
  );
}
