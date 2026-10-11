import { LandingPage, landingMetadata, type LandingContent } from "@/components/LandingPage";

export const metadata = landingMetadata({
  path: "/otter-alternative",
  title: "Private Otter Alternative With No Meeting Bot - Nootle",
  description:
    "Nootle is a free, open-source Otter alternative for Mac. It records without a bot joining the call and transcribes on your Mac, so meeting audio is never uploaded.",
});

const content: LandingContent = {
  eyebrow: "Otter alternative",
  headline: "A private Otter alternative with no bot in your calls",
  subhead:
    "Nootle records meetings directly on your Mac, so no bot joins the call, and transcribes them there, so the audio is never uploaded. It’s free and open source.",
  why: {
    heading: "Why people switch from Otter",
    points: [
      {
        title: "Nothing joins the meeting",
        body: "Nootle records your microphone and your Mac’s system audio directly. There’s no extra participant in the call. It works with Zoom, Google Meet, Microsoft Teams, Webex, Slack, FaceTime and Discord.",
      },
      {
        title: "Audio never leaves your Mac",
        body: "Transcription runs on your Mac with NVIDIA Parakeet. Recordings and transcripts are stored only on your Mac, and the app sends no analytics or crash reports.",
      },
      {
        title: "A built-in way to tell people they’re recorded",
        body: "When a recording starts, Nootle offers a message to paste into the meeting chat telling participants they’re being recorded, and keeps a record that you told them. Otter faced a class action in 2025 over recording people without their consent.",
      },
      {
        title: "Ask across every meeting",
        body: "Ask a question and get an answer drawn from all your meetings, with citations back to the transcript. Search combines keywords and meaning. A People page collects everyone you’ve met with, and “What did I miss?” catches you up during a meeting.",
      },
      {
        title: "Bring your Otter history",
        body: "Import transcripts exported from Otter as SRT, VTT, TXT or Markdown. Export every meeting as Markdown whenever you like.",
      },
    ],
  },
  table: {
    heading: "Nootle vs Otter",
    columns: ["", "Nootle", "Otter"],
    rows: [
      ["How it records", "On your Mac; no bot joins", "A bot joins the call (a desktop app is also available)"],
      ["Where processing happens", "Transcription on your Mac", "In the cloud"],
      ["Price", "Free, open source (MIT)", "Free plan; paid plans from $8.33/month billed annually"],
    ],
    note: "Otter details as of October 2026.",
  },
  faqs: [
    {
      question: "Can I import my Otter transcripts?",
      answer:
        "Yes. Export them from Otter and import them into Nootle as SRT, VTT, TXT or Markdown. They’re searchable alongside everything you record in Nootle.",
    },
    {
      question: "Who does Nootle send my meeting content to?",
      answer:
        "Audio is never uploaded and transcripts are stored only on your Mac. Summaries, chat and action items go to the AI provider you pick: local Ollama models, OpenAI, Anthropic, Google, Groq, OpenRouter or AWS Bedrock with your own key, or your Claude or ChatGPT subscription through Claude Code or Codex CLI. Turn on Local-only mode and meeting content only goes to local models.",
    },
    {
      question: "Does Nootle tell other people on the call?",
      answer:
        "Nootle doesn’t appear in the call, so it’s up to you. When a recording starts it offers a ready-made message to paste into the meeting chat, and records that you sent it.",
    },
    {
      question: "What do I need to run it?",
      answer: "A Mac with Apple Silicon running macOS 14 or later. Nootle is free.",
    },
  ],
};

export default function OtterAlternativePage() {
  return <LandingPage content={content} />;
}
