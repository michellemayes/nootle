import { Lock, Mic, MessageSquare, Lightbulb, Search, Volume2, Zap, SquareKanban, Terminal, LayoutTemplate, type LucideIcon } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  span?: string;
}[] = [
  {
    icon: Lock,
    title: "Local & Private",
    description:
      "All audio recording and transcription happens entirely on your Mac using on-device machine learning. No meeting audio is ever sent to external servers, and transcripts and notes stay on your hardware. AI summaries and chat are only fully local if you choose Ollama as your provider — cloud providers (OpenAI, Anthropic, Google, Groq, OpenRouter, AWS Bedrock) receive transcript context when you invoke them.",
    color: "#34d399",
    span: "md:col-span-2",
  },
  {
    icon: Mic,
    title: "Real-time Transcription",
    description:
      "Live speech-to-text powered by Parakeet via ONNX Runtime, running locally on your Mac. Automatic speaker diarization identifies who said what, so you can follow conversations clearly. Captures both your microphone and system audio simultaneously for complete meeting coverage.",
    color: "#22d3ee",
    span: "md:col-span-2",
  },
  {
    icon: MessageSquare,
    title: "AI Summaries & Chat",
    description:
      "Get instant AI-generated summaries after every meeting, highlighting key decisions and outcomes. Ask follow-up questions about anything discussed — Nootle lets you chat with your meeting transcript using your choice of AI provider: OpenAI, Anthropic, Google, Groq, OpenRouter, AWS Bedrock, or local models via Ollama.",
    color: "#8b5cf6",
  },
  {
    icon: Lightbulb,
    title: "Smart Insights",
    description:
      "Automatically extract decisions, action items, and key moments from every meeting. Nootle identifies what was agreed upon, what needs to happen next, and who is responsible — so nothing falls through the cracks after a busy day of calls.",
    color: "#fbbf24",
  },
  {
    icon: Search,
    title: "Search Across Meetings",
    description:
      "Use AI-powered semantic search to ask questions across your entire meeting history. Instead of scrubbing through hours of recordings, just type a question like \"What did we decide about the launch date?\" and get the answer instantly with the relevant transcript context.",
    color: "#f472b6",
  },
  {
    icon: Volume2,
    title: "Noise Cancellation",
    description:
      "Built-in noise reduction filters out background sounds for cleaner audio capture and more accurate transcriptions. Whether you're in a coffee shop, open office, or noisy home environment, Nootle produces clear, readable transcripts.",
    color: "#22d3ee",
  },
  {
    icon: Zap,
    title: "Auto-Detection",
    description:
      "Nootle automatically detects when you join a meeting on Zoom, Microsoft Teams, or Google Meet and offers to start recording. No manual setup required — just join your call and Nootle handles the rest, so you never miss an important conversation.",
    color: "#fbbf24",
  },
  {
    icon: SquareKanban,
    title: "Workflows & Integrations",
    description:
      "Push meeting notes and action items to the tools you already use. Build workflows that send summaries to Slack, create Linear, GitHub, or Asana tickets, update Notion or Confluence pages, save Markdown to Obsidian, or email a recap — with one click or fully automated per template.",
    color: "#5E6AD2",
  },
  {
    icon: LayoutTemplate,
    title: "Customizable Templates",
    description:
      "Tailor summaries to how you actually work. Create templates with custom sections and prompts for standups, 1:1s, interviews, or sales calls, and use auto-apply rules so the right template runs automatically based on meeting context.",
    color: "#fbbf24",
  },
  {
    icon: Terminal,
    title: "CLI & Developer Tools",
    description:
      "Query your meetings from the terminal with Nootle's built-in CLI. An MCP server enables AI assistant integration, letting tools like Claude or GPT access your meeting data for deeper analysis and automated workflows.",
    color: "#34d399",
  },
];

export function Features() {
  return (
    <section id="features" aria-label="Meeting recording features" className="py-24 px-6 bg-[var(--color-surface)]">
      <div className="max-w-6xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-4 text-[var(--color-text)]">
            Meeting recording features
          </h2>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <p className="text-center text-[var(--color-text-secondary)] text-lg mb-16 max-w-lg mx-auto">
            Everything you need to capture, understand, and act on your meetings.
          </p>
        </AnimateIn>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {features.map((feature, i) => (
            <AnimateIn
              key={feature.title}
              className={`group relative p-7 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] overflow-hidden transition-[transform,translate,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_var(--hover-glow)] ${feature.span || ""}`}
              delay={i * 0.05}
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${feature.color}40, transparent)` }}
              />
              <div
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
                style={{ backgroundColor: `${feature.color}15` }}
              >
                <feature.icon
                  className="w-5 h-5"
                  style={{ color: feature.color }}
                />
              </div>
              <h3 className="font-[family-name:var(--font-outfit)] text-lg font-bold mb-2 text-[var(--color-text)]">
                {feature.title}
              </h3>
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                {feature.description}
              </p>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
