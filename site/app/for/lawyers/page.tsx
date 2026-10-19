import { LandingPage, landingMetadata, type LandingContent } from "@/components/LandingPage";

export const metadata = landingMetadata({
  path: "/for/lawyers",
  title: "Private Meeting Notes for Lawyers - Nootle",
  description:
    "Record and transcribe client calls on your Mac with no bot in the meeting. Audio is never uploaded, transcripts are stored only on your Mac, and you control where any AI processing happens.",
});

const content: LandingContent = {
  eyebrow: "For attorneys",
  headline: "Private meeting notes for attorneys",
  subhead:
    "Nootle records and transcribes client calls on your Mac. Audio is never uploaded and transcripts are stored only on your Mac. With Local-only mode, no meeting content leaves it at all.",
  answer: {
    question: "Can lawyers use an AI notetaker without sending client calls to the cloud?",
    body: "Yes, if the notetaker runs on your own computer. Nootle records and transcribes on your Mac, so audio is never uploaded, and Local-only mode keeps summaries on local models too. That makes it a good fit for confidential client calls where you want fewer third parties to account for. If your firm needs one centrally managed tool with admin controls, retention policies and Windows support, an enterprise service will fit better. Either way, check the recording-consent rules that apply to you first.",
  },
  published: "2026-10-11",
  updated: "2026-10-19",
  why: {
    heading: "Built for conversations you can’t hand to a cloud service",
    points: [
      {
        title: "Recordings and transcripts are stored on your Mac",
        body: "Transcription runs on your Mac with NVIDIA Parakeet. Meeting audio is never uploaded, recordings and transcripts are stored only on your Mac, and the app sends no analytics or crash reports.",
      },
      {
        title: "You control where any AI processing happens",
        body: "Summaries, chat and action items use the provider you choose. With Local-only mode on, meeting content only goes to local Ollama models and workflows don’t send anything to integrations. If your policies allow a cloud provider, you use your own key.",
      },
      {
        title: "No bot in the client call",
        body: "Nootle records your microphone and your Mac’s system audio, so no extra participant joins. It works with Zoom, Microsoft Teams, Google Meet, Webex, Slack, FaceTime and Discord.",
      },
      {
        title: "A consent reminder at the start",
        body: "When a recording starts, Nootle offers a message to paste into the meeting chat telling participants they’re being recorded, and keeps a record that you told them.",
      },
      {
        title: "Find what was said, with the source",
        body: "Ask a question across all your meetings and the answer cites the transcript. Export any meeting as Markdown to keep with your own files.",
      },
    ],
  },
  table: {
    heading: "What leaves your Mac",
    columns: ["", "Where it goes"],
    rows: [
      ["Meeting audio", "Nowhere. It stays on your Mac."],
      ["Transcripts", "Stored only on your Mac. Sent to an AI provider only to write summaries or answer questions, and with Local-only mode only to local models."],
      [
        "Summaries, chat, action items",
        "The AI provider you choose. With Local-only mode, only local models on your Mac.",
      ],
      ["Workflows to other apps", "Only the ones you set up. With Local-only mode, nothing is sent."],
      ["Share links", "Only the meetings you choose to share, end-to-end encrypted on your Mac, so nootle.ai can’t read them. Off in Local-only mode."],
      ["Analytics and crash reports", "None. The app doesn’t send them."],
    ],
  },
  faqs: [
    {
      question: "Does Nootle make recordings privileged or meet my bar’s rules?",
      answer:
        "No tool can decide that for you. Nootle keeps audio and transcripts on your Mac and lets you keep AI processing local, which gives you fewer third parties to account for. Whether and how you record a conversation is your call under the rules that apply to you.",
    },
    {
      question: "Can I use Nootle without any cloud AI?",
      answer:
        "Yes. Turn on Local-only mode and use a local model through Ollama. Meeting content then only goes to models running on your Mac, and workflows don’t send anything to integrations.",
    },
    {
      question: "Will Nootle remember clients’ voices?",
      answer:
        "Only if you turn on Remember voices. It’s opt-in, the voice fingerprints are stored on your Mac, and you can delete them.",
    },
    {
      question: "Can I export my notes?",
      answer: "Yes. You can export all your meetings as Markdown files.",
    },
  ],
  disclaimer:
    "Nootle helps keep meeting data on your Mac, but it isn’t legal advice. Confirm your own obligations, such as recording-consent rules in each participant’s jurisdiction, confidentiality duties and record-keeping requirements.",
};

export default function LawyersPage() {
  return <LandingPage content={content} />;
}
