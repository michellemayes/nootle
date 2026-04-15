import { AnimateIn } from "@/components/AnimateIn";
import { Shield, Wifi, DollarSign, Code } from "lucide-react";

const differences = [
  {
    icon: Shield,
    title: "Privacy by design",
    description:
      "Cloud recorders like Otter.ai and Fireflies.ai upload your meeting audio to their servers for processing. Nootle processes everything on your Mac — your conversations never leave your hardware. No cloud accounts, no data sharing agreements, no third-party access to your meeting content.",
    color: "#34d399",
  },
  {
    icon: Wifi,
    title: "Works offline",
    description:
      "Because transcription runs locally via ONNX Runtime, Nootle's core recording and transcription features work without an internet connection. Cloud-based tools require a stable connection throughout your entire meeting, and will fail or produce gaps if your connection drops.",
    color: "#22d3ee",
  },
  {
    icon: DollarSign,
    title: "Free and open source",
    description:
      "Most AI meeting recorders charge $15–30 per month for transcription and summaries. Nootle is completely free under the MIT license. You only pay for AI provider API usage if you choose to use cloud-based summarization — and you can avoid even that by using Ollama with a local model.",
    color: "#fbbf24",
  },
  {
    icon: Code,
    title: "Developer-friendly",
    description:
      "Nootle includes a CLI for querying meetings from the terminal and an MCP server that lets AI assistants like Claude access your meeting data. The entire codebase is open source on GitHub, so you can extend, customize, or self-audit every aspect of how your data is handled.",
    color: "#8b5cf6",
  },
];

export function Comparison() {
  return (
    <section aria-label="Why choose Nootle" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-3xl md:text-4xl font-bold text-center mb-4 text-[var(--color-text)]">
            Why choose Nootle over cloud alternatives?
          </h2>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <p className="text-center text-[var(--color-text-secondary)] text-base mb-14 max-w-xl mx-auto">
            Unlike Otter.ai, Fireflies.ai, and other cloud-based meeting recorders, Nootle
            keeps your data local and your costs at zero.
          </p>
        </AnimateIn>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {differences.map((item, i) => (
            <AnimateIn key={item.title} delay={i * 0.1}>
              <div className="p-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] h-full">
                <div
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <item.icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <h3 className="font-[family-name:var(--font-outfit)] text-xl font-bold mb-3 text-[var(--color-text)]">
                  {item.title}
                </h3>
                <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
