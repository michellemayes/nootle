import { LandingPage, landingMetadata, type LandingContent } from "@/components/LandingPage";

export const metadata = landingMetadata({
  path: "/for/therapists",
  title: "Private Session Notes for Therapists - Nootle",
  description:
    "Record and transcribe telehealth sessions on your Mac with no bot in the call. Audio is never uploaded, transcripts are stored only on your Mac, and you control where any AI processing happens.",
});

const content: LandingContent = {
  eyebrow: "For clinicians",
  headline: "Private session notes for clinicians",
  subhead:
    "Nootle records and transcribes video sessions on your Mac. Audio is never uploaded and transcripts are stored only on your Mac. With Local-only mode, no meeting content leaves it at all.",
  why: {
    heading: "Keep session content where you can see it",
    points: [
      {
        title: "Session audio stays on your Mac",
        body: "Transcription runs on your Mac with NVIDIA Parakeet. Audio is never uploaded, and recordings and transcripts are stored only on your Mac.",
      },
      {
        title: "You control where any AI processing happens",
        body: "Summaries, chat and action items use the provider you choose. With Local-only mode on, session content only goes to local Ollama models and workflows don’t send anything to integrations.",
      },
      {
        title: "No bot in the session",
        body: "Nootle records your microphone and your Mac’s system audio, so your client doesn’t see an extra participant. It works with Zoom, Google Meet, Microsoft Teams, Webex, FaceTime and more.",
      },
      {
        title: "A consent reminder every time",
        body: "When a recording starts, Nootle offers a message to paste into the meeting chat telling participants they’re being recorded, and keeps a record that you told them.",
      },
      {
        title: "Nothing reports back",
        body: "The app sends no analytics or crash reports. It’s open source under the MIT license, so you or your IT support can check how it handles data.",
      },
    ],
  },
  table: {
    heading: "What leaves your Mac",
    columns: ["", "Where it goes"],
    rows: [
      ["Session audio", "Nowhere. It stays on your Mac."],
      ["Transcripts", "Stored only on your Mac. Sent to an AI provider only to write summaries or answer questions, and with Local-only mode only to local models."],
      [
        "Summaries and chat",
        "The AI provider you choose. With Local-only mode, only local models on your Mac.",
      ],
      ["Voice fingerprints", "Only created if you turn on Remember voices. Stored on your Mac and deletable."],
      ["Share links", "Only the meetings you choose to share, end-to-end encrypted on your Mac, so nootle.ai can’t read them. Off in Local-only mode."],
      ["Analytics and crash reports", "None. The app doesn’t send them."],
    ],
  },
  faqs: [
    {
      question: "Is Nootle HIPAA compliant?",
      answer:
        "Nootle doesn’t claim to be HIPAA compliant and isn’t certified under any framework. What it does: audio is never uploaded, transcripts are stored only on your Mac, Local-only mode keeps all session content on local models, and the app sends no analytics. Check with your own compliance guidance whether that meets your obligations.",
    },
    {
      question: "Can I write summaries without sending anything to the cloud?",
      answer:
        "Yes. Turn on Local-only mode and use a local model through Ollama. Summaries and chat then run on your Mac.",
    },
    {
      question: "Will Nootle remember my clients’ voices?",
      answer:
        "Not unless you turn on Remember voices. It’s opt-in, the voice fingerprints stay on your Mac, and you can delete them at any time.",
    },
    {
      question: "What do I need to run it?",
      answer: "A Mac with Apple Silicon running macOS 14 or later. Nootle is free and open source.",
    },
  ],
  disclaimer:
    "Nootle helps keep session data on your Mac, but it isn’t legal or compliance advice. Confirm your own obligations, such as client consent, licensing-board rules and record-keeping requirements where you practice.",
};

export default function TherapistsPage() {
  return <LandingPage content={content} />;
}
