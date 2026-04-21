import { SiZoom, SiGooglemeet, SiSlack, SiLinear, SiNotion, SiConfluence, SiGithub, SiAsana, SiObsidian } from "react-icons/si";
import { BsMicrosoftTeams } from "react-icons/bs";
import { HiOutlineMail } from "react-icons/hi";
import type { IconType } from "react-icons";
import { AnimateIn } from "@/components/AnimateIn";

const integrations: { name: string; color: string; icon: IconType }[] = [
  { name: "Slack", color: "#E01E5A", icon: SiSlack },
  { name: "Notion", color: "#FFFFFF", icon: SiNotion },
  { name: "Confluence", color: "#1868DB", icon: SiConfluence },
  { name: "GitHub", color: "#FFFFFF", icon: SiGithub },
  { name: "Linear", color: "#5E6AD2", icon: SiLinear },
  { name: "Asana", color: "#F06A6A", icon: SiAsana },
  { name: "Email", color: "#34A853", icon: HiOutlineMail },
  { name: "Zoom", color: "#2D8CFF", icon: SiZoom },
  { name: "Teams", color: "#6264A7", icon: BsMicrosoftTeams },
  { name: "Google Meet", color: "#00897B", icon: SiGooglemeet },
  { name: "Obsidian", color: "#7C3AED", icon: SiObsidian },
];

export function Integrations() {
  return (
    <section aria-label="Meeting app integrations" className="py-20 px-6 bg-[var(--color-surface)]">
      <div className="max-w-4xl mx-auto">
        <AnimateIn>
          <p className="font-[family-name:var(--font-outfit)] text-sm font-semibold tracking-[0.2em] uppercase text-center mb-4 text-[var(--color-accent)]">
            Integrations
          </p>
        </AnimateIn>
        <AnimateIn delay={0.05}>
          <h2 className="font-[family-name:var(--font-outfit)] text-3xl md:text-4xl font-bold text-center mb-4 text-[var(--color-text)]">
            Meeting app integrations
          </h2>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <p className="text-center text-[var(--color-text-secondary)] text-base mb-14 max-w-md mx-auto">
            Auto-detects meetings and pushes notes to the tools you already use.
          </p>
        </AnimateIn>

        <div className="flex flex-wrap justify-center gap-4">
          {integrations.map((item, i) => {
            const Icon = item.icon;
            return (
              <AnimateIn
                key={item.name}
                className="group flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] transition-[transform,translate,border-color] duration-200 w-[calc(50%-0.5rem)] sm:w-[calc(20%-0.8rem)] hover:-translate-y-1"
                delay={i * 0.04}
              >
                <div
                  className="flex items-center justify-center w-14 h-14 rounded-xl transition-transform duration-150 group-hover:scale-110"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${item.color} 12%, var(--color-bg))`,
                    color: item.color,
                  }}
                >
                  <Icon size={28} />
                </div>
                <span className="text-sm font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)] transition-colors duration-150">
                  {item.name}
                </span>
              </AnimateIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
