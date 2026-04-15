import { AnimateIn } from "@/components/AnimateIn";

const steps = [
  {
    number: "01",
    title: "Join your meeting",
    description:
      "Nootle runs quietly in your menu bar and automatically detects when you join a call on Zoom, Microsoft Teams, Google Meet, or other conferencing apps. It prompts you to start recording — no manual setup or browser extensions needed.",
    color: "#22d3ee",
  },
  {
    number: "02",
    title: "Record & transcribe",
    description:
      "Audio is captured from both your microphone and system output, then transcribed in real time using on-device machine learning. Speaker diarization labels each segment so you can see exactly who said what throughout the conversation.",
    color: "#8b5cf6",
  },
  {
    number: "03",
    title: "Review & chat",
    description:
      "After the meeting, browse the full transcript with speaker labels and timestamps. Get an AI-generated summary of key points, decisions, and action items. Ask follow-up questions about anything discussed — Nootle's AI chat lets you query the transcript conversationally.",
    color: "#f472b6",
  },
  {
    number: "04",
    title: "Run workflows",
    description:
      "Automatically push meeting notes and action items to the tools your team uses. Send summaries to Slack channels, create Linear or Asana tickets, update Notion or Confluence pages, or email a recap to attendees — all with a single click or fully automated.",
    color: "#34d399",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-label="How Nootle works" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-bold text-center mb-16 text-[var(--color-text)]">
            How Nootle works
          </h2>
        </AnimateIn>

        <div className="space-y-12 relative">
          <div
            className="absolute left-6 top-6 bottom-6 w-px opacity-40"
            style={{ background: "linear-gradient(to bottom, #22d3ee, #8b5cf6, #f472b6, #34d399)" }}
          />

          {steps.map((step, i) => (
            <AnimateIn
              key={step.number}
              className="flex gap-8 items-start relative"
              delay={i * 0.15}
            >
              <div
                className="font-[family-name:var(--font-outfit)] text-sm font-bold w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative z-10"
                style={{
                  backgroundColor: `${step.color}15`,
                  color: step.color,
                  border: `1px solid ${step.color}30`,
                  boxShadow: `0 0 20px -4px ${step.color}25`,
                }}
              >
                {step.number}
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-outfit)] text-2xl font-bold mb-2 text-[var(--color-text)]">
                  {step.title}
                </h3>
                <p className="text-[var(--color-text-secondary)] text-base leading-relaxed">
                  {step.description}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
