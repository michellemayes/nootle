import { AnimateIn } from "@/components/AnimateIn";
import { Monitor, Cpu, HardDrive, Shield } from "lucide-react";

const requirements = [
  {
    icon: Monitor,
    label: "Operating System",
    value: "macOS 14 (Sonoma) or later",
  },
  {
    icon: Cpu,
    label: "Processor",
    value: "Apple Silicon (M1, M2, M3, M4) or Intel",
  },
  {
    icon: HardDrive,
    label: "Storage",
    value: "200 MB for app, plus space for recordings",
  },
  {
    icon: Shield,
    label: "Permissions",
    value: "Microphone and Screen Recording access",
  },
];

export function SystemRequirements() {
  return (
    <section aria-label="System requirements" className="py-16 px-6 bg-[var(--color-surface)]">
      <div className="max-w-3xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-2xl md:text-3xl font-bold text-center mb-10 text-[var(--color-text)]">
            System requirements
          </h2>
        </AnimateIn>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {requirements.map((req, i) => (
            <AnimateIn key={req.label} delay={i * 0.08}>
              <div className="flex items-start gap-4 p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
                <req.icon className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="font-[family-name:var(--font-outfit)] font-semibold text-sm text-[var(--color-text)]">
                    {req.label}
                  </p>
                  <p className="text-[var(--color-text-secondary)] text-sm">
                    {req.value}
                  </p>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
