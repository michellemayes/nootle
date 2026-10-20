import { LandingPage, landingMetadata, type LandingContent } from "@/components/LandingPage";

export const metadata = landingMetadata({
  path: "/granola-alternative",
  title: "Open-Source Granola Alternative for Mac - Nootle",
  description:
    "Nootle is a free, open-source Granola alternative for Mac. No bot in your calls, transcription on your Mac, real speaker labels, and Markdown export.",
});

const content: LandingContent = {
  eyebrow: "Granola alternative",
  headline: "The open-source, local Granola alternative",
  subhead:
    "Like Granola, Nootle records meetings from your Mac with no bot in the call. Unlike Granola, it transcribes on your Mac, keeps recordings and transcripts there, and is free and open source.",
  answer: {
    question: "Which is better, Nootle or Granola?",
    body: "It depends on where you want your meetings to live. If you want transcription on your Mac, speaker labels beyond “Me” and “Them”, and notes you can export as Markdown for free, Nootle is the better choice: it’s open source and meeting audio never leaves your Mac. Granola fits better if you need it on Windows, an iPhone or an Intel Mac, or want a shared team workspace out of the box. As of October 2026, Granola’s Business plan costs $14 a month; Nootle is free.",
  },
  published: "2026-10-11",
  updated: "2026-10-19",
  why: {
    heading: "Why people switch from Granola",
    points: [
      {
        title: "Transcription happens on your Mac",
        body: "Nootle transcribes with NVIDIA Parakeet running on your Mac. Meeting audio is never uploaded, and recordings and transcripts are stored only on your Mac. As of October 2026, Granola transcribes in the cloud.",
      },
      {
        title: "Speaker labels beyond Me and Them",
        body: "Your mic is labeled “You” and the other speakers are told apart. After the meeting, a second pass relabels speakers using the whole recording. Turn on Remember voices and Nootle names people automatically in later meetings; the voice fingerprints stay on your Mac, are opt-in, and can be deleted.",
      },
      {
        title: "Your notes stay readable by your own tools",
        body: "Export every meeting as Markdown, query your meetings from the CLI, or connect an AI assistant through the MCP server, with a read-only mode if you want one. The code is MIT-licensed, so you can see how your data is stored.",
      },
      {
        title: "Pick the AI, or keep it all local",
        body: "Summaries, chat and action items use the provider you choose: local Ollama models, OpenAI, Anthropic, Google, Groq, OpenRouter or AWS Bedrock with your own key, or your Claude or ChatGPT subscription through Claude Code or Codex CLI. Local-only mode sends meeting content to local models only.",
      },
      {
        title: "Bring your Granola history",
        body: "Import transcripts you’ve exported from Granola (or Otter, Fathom, Zoom, Teams and Meet) as SRT, VTT, TXT or Markdown, then ask questions across all of them with answers that cite the transcript.",
      },
    ],
  },
  table: {
    heading: "Nootle vs Granola",
    columns: ["", "Nootle", "Granola"],
    rows: [
      ["Bot joins the call", "No", "No"],
      ["Where transcription runs", "On your Mac", "In the cloud"],
      [
        "Speaker labels",
        "“You” plus each speaker told apart, relabeled after the meeting; optional named voices",
        "“Me” and “Them” in desktop transcripts",
      ],
      [
        "Getting your notes out",
        "Markdown export, CLI, MCP server",
        "Encrypted its local note cache in 2026, which broke third-party scripts",
      ],
      ["Price", "Free, open source (MIT)", "Free plan with limited history; Business $14/month"],
    ],
    note: "Granola details as of October 2026.",
  },
  faqs: [
    {
      question: "Can I move my Granola notes into Nootle?",
      answer:
        "Yes. Export your transcripts from Granola and import them into Nootle as SRT, VTT, TXT or Markdown files. They become searchable alongside the meetings you record in Nootle.",
    },
    {
      question: "Does Nootle join my calls as a bot?",
      answer:
        "No. Nootle records your microphone and your Mac’s system audio directly, so nothing joins the call. It works with Zoom, Google Meet, Microsoft Teams, Webex, Slack, FaceTime and Discord.",
    },
    {
      question: "Is Nootle really free?",
      answer:
        "Yes. Nootle is free and open source under the MIT license. If you choose a cloud AI provider for summaries with your own key, that provider bills you for your usage. Local Ollama models or your existing Claude or ChatGPT subscription avoid that.",
    },
    {
      question: "Which Macs does it run on?",
      answer: "macOS 14 or later on Apple Silicon. Intel Macs aren’t supported.",
    },
  ],
};

export default function GranolaAlternativePage() {
  return <LandingPage content={content} />;
}
