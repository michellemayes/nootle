import { LandingPage, landingMetadata, type LandingContent } from "@/components/LandingPage";

export const metadata = landingMetadata({
  path: "/for/researchers",
  title: "UX Research Interview Notes on Your Mac - Nootle",
  description:
    "Record user interviews with no bot in the call, transcribe them on your Mac, and ask questions across every session with answers that cite the transcript. Free and open source.",
});

const content: LandingContent = {
  eyebrow: "For UX researchers",
  headline: "UX research and interview notes, kept on your Mac",
  subhead:
    "Record user interviews without a bot in the call, transcribe them on your Mac, and ask questions across every session with answers that cite the transcript.",
  answer: {
    question: "What’s the best way to record and analyze user interviews privately?",
    body: "It depends on how your team works. If you run interviews over video calls on a Mac and want transcripts that stay on your machine, Nootle is a good fit: it records without a bot, transcribes on your Mac and answers questions across every session with citations. If you need a shared research repository where a whole team tags clips and builds highlight reels, a dedicated tool like Dovetail fits better. You can still export Nootle transcripts as Markdown and bring them there.",
  },
  published: "2026-10-11",
  updated: "2026-10-19",
  why: {
    heading: "Made for a stack of interviews",
    points: [
      {
        title: "Participants only see you",
        body: "Nootle records your microphone and your Mac’s system audio, so no bot joins the session. It works with Zoom, Google Meet, Microsoft Teams, Webex, Slack, FaceTime and Discord.",
      },
      {
        title: "Ask across every session",
        body: "Ask “what did people say about onboarding?” and get an answer drawn from all your interviews, with citations back to the transcript. Search combines keywords and meaning, so you find quotes even when people use different words.",
      },
      {
        title: "Speaker labels you can trust",
        body: "Your mic is labeled “You” and other speakers are told apart. After the session, a second pass relabels speakers using the whole recording. Remember voices (opt-in, stored on your Mac, deletable) names repeat stakeholders automatically.",
      },
      {
        title: "Participant data stays on your Mac",
        body: "Transcription runs on your Mac with NVIDIA Parakeet, and recordings and transcripts are stored only there. Local-only mode keeps summaries and chat on local models too.",
      },
      {
        title: "Works with the rest of your tools",
        body: "Import past interviews from Zoom, Teams, Meet, Otter, Fathom or Granola as SRT, VTT, TXT or Markdown. Export everything as Markdown for your synthesis tool, or pull quotes into an AI assistant through the MCP server, which has a read-only mode.",
      },
    ],
  },
  faqs: [
    {
      question: "How do I let participants know they’re being recorded?",
      answer:
        "When a recording starts, Nootle offers a message to paste into the meeting chat telling participants they’re being recorded, and keeps a record that you told them.",
    },
    {
      question: "Can I use Claude or ChatGPT for synthesis?",
      answer:
        "Yes. Use your Claude or ChatGPT subscription through Claude Code or Codex CLI, or an API key for OpenAI, Anthropic, Google, Groq, OpenRouter or AWS Bedrock. If your study requires it, Local-only mode limits meeting content to local Ollama models.",
    },
    {
      question: "Can I bring in interviews I’ve already done?",
      answer:
        "Yes. Import transcripts from Zoom, Teams, Meet, Otter, Fathom or Granola as SRT, VTT, TXT or Markdown, and they’re searchable with everything else.",
    },
    {
      question: "What does it cost?",
      answer:
        "Nothing. Nootle is free and open source under the MIT license. It runs on Apple Silicon Macs with macOS 14 or later.",
    },
  ],
  disclaimer:
    "Confirm your study’s consent and data-handling requirements, such as your consent form, IRB or company policy. Nootle helps keep data on your Mac, but it isn’t legal advice.",
};

export default function ResearchersPage() {
  return <LandingPage content={content} />;
}
