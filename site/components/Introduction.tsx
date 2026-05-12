import { AnimateIn } from "@/components/AnimateIn";

export function Introduction() {
  return (
    <section aria-label="About Nootle" className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-3xl md:text-4xl font-bold text-center mb-8 text-[var(--color-text)]">
            What is Nootle?
          </h2>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <div className="space-y-5 text-[var(--color-text-secondary)] text-base leading-relaxed">
            <p>
              Nootle is a free, open-source AI meeting recorder designed exclusively for Mac.
              It sits quietly in your menu bar and automatically detects when you join a call
              on Zoom, Microsoft Teams, or Google Meet. Once recording begins, Nootle
              transcribes the conversation in real time with automatic speaker identification
              — so you always know who said what.
            </p>
            <p>
              What sets Nootle apart from cloud-based alternatives is that all audio
              recording and transcription happens locally on your Mac. Your meeting
              recordings, transcripts, and notes never leave your computer. Transcription
              is powered by Parakeet, a state-of-the-art speech recognition model running
              via ONNX Runtime, delivering accurate results without requiring an internet
              connection for the core recording and transcription features. AI summaries
              and chat are only fully local if you point Nootle at Ollama — when you pick a
              cloud provider, transcript context is sent to that provider with your own API
              key.
            </p>
            <p>
              After each meeting, Nootle generates AI-powered summaries, extracts action items,
              and lets you ask follow-up questions about anything discussed. You choose your
              AI provider — OpenAI, Anthropic, Google, Groq, OpenRouter, AWS Bedrock, or a
              fully local model via Ollama. Meeting insights can be automatically pushed to
              Slack, Notion, Linear, Confluence, GitHub, Asana, Obsidian, or email — and you
              can build custom templates and workflows so the right summary and the right
              follow-up actions run automatically for every meeting type.
            </p>
            <p>
              Nootle is built for developers, product managers, and anyone who spends their
              day in meetings and wants to stay focused on the conversation instead of
              taking notes. It&apos;s MIT-licensed, actively maintained, and built by{" "}
              <a
                href="https://michellemayes.me"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                Michelle Mayes
              </a>
              .
            </p>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
