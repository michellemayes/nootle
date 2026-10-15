import type { ComponentType } from "react";
import { Check } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  EnrichVignette,
  KnowledgeVignette,
  LiveAssistVignette,
  PrivacyVignette,
  ProvidersVignette,
  SnapshotsVignette,
  SpeakersVignette,
} from "@/components/FeatureVignettes";
import { outfit } from "@/components/site-config";

const spotlights: {
  id?: string;
  title: string;
  description: string;
  vignette: ComponentType;
  span: string;
  isNew?: boolean;
}[] = [
  {
    id: "live-assist",
    title: "Live Assist answers mid-call",
    description:
      "While you record, a side panel listens for questions your documents or past meetings can answer and shows a short reply you could say aloud, with its sources. Type your own question any time. Small talk is ignored, and it stays quiet when nothing relevant turns up.",
    vignette: LiveAssistVignette,
    span: "md:col-span-4",
    isNew: true,
  },
  {
    title: "Local by default",
    description:
      "Recording and transcription always run on your Mac, and audio is never uploaded. Turn on Local-only mode and only local models can see meeting content. No telemetry, ever.",
    vignette: PrivacyVignette,
    span: "md:col-span-2",
  },
  {
    title: "A knowledge base of your docs",
    description:
      "Add project folders, files, and web pages: PDF, Word, PowerPoint, Excel, Markdown, and more. Nootle indexes them on your Mac and answers from them alongside your meetings, citing the page or slide.",
    vignette: KnowledgeVignette,
    span: "md:col-span-2",
    isNew: true,
  },
  {
    title: "Speakers it remembers",
    description:
      "Every voice is told apart, and names are read from the call's video tiles. Turn on Remember voices and people you've named are recognised in later meetings, on any app or in person.",
    vignette: SpeakersVignette,
    span: "md:col-span-2",
  },
  {
    title: "Snapshots of shared screens",
    description:
      "When someone shares slides, designs, or charts, Nootle snaps one picture per slide into your notes and reads the text on your Mac, so you can ask what the revenue chart said.",
    vignette: SnapshotsVignette,
    span: "md:col-span-2",
  },
  {
    title: "Shorthand in, full notes out",
    description:
      "Jot terse notes while you talk. When the call ends, Nootle expands them from the transcript, the calendar agenda, and your knowledge base. Your originals stay one click away.",
    vignette: EnrichVignette,
    span: "md:col-span-3",
    isNew: true,
  },
  {
    title: "Any AI, including the one you pay for",
    description:
      "Use OpenAI, Anthropic, Google, Groq, OpenRouter, or AWS Bedrock with your own key, local models through Ollama, or your existing Claude or ChatGPT subscription through the Claude Code and Codex CLIs.",
    vignette: ProvidersVignette,
    span: "md:col-span-3",
  },
];

const groups: { heading: string; items: { title: string; body: string }[] }[] = [
  {
    heading: "Capture",
    items: [
      { title: "Meeting detection", body: "A pop-up offers to record when a call starts on Zoom, Teams, Webex, Slack, FaceTime, Discord, or in the browser." },
      { title: "Calendar up next", body: "One-click Record and Join, recordings named after the event, and what's still open from last time." },
      { title: "Live audio levels", body: "Mic and call meters, plus a warning if Nootle hears nothing for 20 seconds." },
      { title: "Pause and resume", body: "Go off the record mid-meeting. Nothing is captured while paused." },
      { title: "Crash-safe recording", body: "Saved every few seconds and recovered on next launch if anything quits." },
      { title: "Import anything", body: "Audio and video files, or transcripts from Otter, Fathom, Granola, Zoom, Teams, and Meet." },
    ],
  },
  {
    heading: "Understand",
    items: [
      { title: "Summaries and insights", body: "Decisions, action items with owners, and key moments from every meeting." },
      { title: "Ask across everything", body: "Chat with every meeting and document at once, with citations you can click." },
      { title: "What did I miss?", body: "One click recaps the last five minutes and anything asked of you." },
      { title: "People", body: "Everyone you meet, how often, and the action items they own." },
      { title: "A dictionary that learns", body: "Fix a misheard name once and it's right in every future meeting." },
      { title: "Synced playback", body: "Click any line or timestamp to hear that moment, at up to 2× speed." },
    ],
  },
  {
    heading: "Act and own",
    items: [
      { title: "Workflows", body: "Send summaries and tasks to Slack, Notion, Confluence, Linear, GitHub, Asana, Obsidian, or email." },
      { title: "Templates", body: "Summary formats for 1:1s, standups, or interviews that run on their own." },
      { title: "MCP server and CLI", body: "Let Claude Code and other agents read meetings and set up automations." },
      { title: "Plain files you own", body: "Export one meeting or all of them as Markdown, text, SRT, or WebVTT." },
      { title: "Keyboard-first", body: "⌘K command palette, ⌘N to record from anywhere, and ? for every shortcut." },
      { title: "Updates in one click", body: "New versions install themselves, never in the middle of a recording." },
    ],
  },
];

export function Features() {
  return (
    <section id="features" aria-label="Meeting recording features" className="py-24 px-6 bg-[var(--color-surface)] scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <AnimateIn>
          <h2 className={`${outfit} text-4xl md:text-5xl font-bold text-center mb-4 text-[var(--color-text)]`}>
            Meeting recording features
          </h2>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <p className="text-center text-[var(--color-text-secondary)] text-lg mb-16 max-w-xl mx-auto">
            Everything you need to capture, understand, and act on your meetings, and now your docs too.
          </p>
        </AnimateIn>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {spotlights.map((feature, i) => {
            const Vignette = feature.vignette;
            return (
              <AnimateIn key={feature.title} className={feature.span} delay={(i % 3) * 0.08}>
                <SpotlightCard id={feature.id} className="p-5">
                  <Vignette />
                  <div className="px-1 pt-5 pb-1">
                    <h3 className={`${outfit} flex items-center gap-2 text-lg font-bold mb-2 text-[var(--color-text)]`}>
                      {feature.title}
                      {feature.isNew && (
                        <span className="rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
                          New
                        </span>
                      )}
                    </h3>
                    <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </SpotlightCard>
              </AnimateIn>
            );
          })}
        </div>

        <AnimateIn className="mt-20 mb-10">
          <h3 className={`${outfit} text-2xl md:text-3xl font-bold text-center text-[var(--color-text)]`}>
            And everything around the call
          </h3>
        </AnimateIn>
        <div className="grid gap-10 md:grid-cols-3">
          {groups.map((group, g) => (
            <AnimateIn key={group.heading} delay={g * 0.1}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
                {group.heading}
              </p>
              <ul className="space-y-4">
                {group.items.map((item) => (
                  <li key={item.title} className="group flex gap-3">
                    <span className="mt-0.5 flex w-5 h-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                    <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      <span className="font-semibold text-[var(--color-text)]">{item.title}.</span> {item.body}
                    </p>
                  </li>
                ))}
              </ul>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
