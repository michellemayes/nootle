import {
  SiAnthropic,
  SiAsana,
  SiClaude,
  SiConfluence,
  SiDiscord,
  SiGithub,
  SiGooglegemini,
  SiGooglemeet,
  SiLinear,
  SiNotion,
  SiObsidian,
  SiOllama,
  SiOpenai,
  SiSlack,
  SiWebex,
  SiZoom,
} from "react-icons/si";
import { BsMicrosoftTeams } from "react-icons/bs";
import { HiOutlineMail } from "react-icons/hi";
import { Cloud, Globe, Route, Terminal, Video, Zap } from "lucide-react";
import type { ComponentType } from "react";
import { AnimateIn } from "@/components/AnimateIn";

type Item = { name: string; color: string; icon: ComponentType<{ size?: number }> };

const rows: { label: string; reverse?: boolean; duration: string; items: Item[] }[] = [
  {
    label: "Records calls on",
    duration: "40s",
    items: [
      { name: "Zoom", color: "#2D8CFF", icon: SiZoom },
      { name: "Microsoft Teams", color: "#7B83EB", icon: BsMicrosoftTeams },
      { name: "Google Meet", color: "#00AC47", icon: SiGooglemeet },
      { name: "Webex", color: "#00BCEB", icon: SiWebex },
      { name: "Slack huddles", color: "#E01E5A", icon: SiSlack },
      { name: "FaceTime", color: "#34C759", icon: Video },
      { name: "Discord", color: "#5865F2", icon: SiDiscord },
      { name: "Browser calls", color: "#938da3", icon: Globe },
    ],
  },
  {
    label: "Thinks with",
    reverse: true,
    duration: "50s",
    items: [
      { name: "Ollama", color: "#FFFFFF", icon: SiOllama },
      { name: "Claude Code", color: "#D97757", icon: SiClaude },
      { name: "Codex CLI", color: "#FFFFFF", icon: Terminal },
      { name: "OpenAI", color: "#FFFFFF", icon: SiOpenai },
      { name: "Anthropic", color: "#D4A27F", icon: SiAnthropic },
      { name: "Google Gemini", color: "#8E75FF", icon: SiGooglegemini },
      { name: "Groq", color: "#F55036", icon: Zap },
      { name: "OpenRouter", color: "#94A3F8", icon: Route },
      { name: "AWS Bedrock", color: "#FF9900", icon: Cloud },
    ],
  },
  {
    label: "Sends notes to",
    duration: "45s",
    items: [
      { name: "Slack", color: "#E01E5A", icon: SiSlack },
      { name: "Notion", color: "#FFFFFF", icon: SiNotion },
      { name: "Confluence", color: "#1868DB", icon: SiConfluence },
      { name: "Linear", color: "#5E6AD2", icon: SiLinear },
      { name: "GitHub", color: "#FFFFFF", icon: SiGithub },
      { name: "Asana", color: "#F06A6A", icon: SiAsana },
      { name: "Obsidian", color: "#A88BFA", icon: SiObsidian },
      { name: "Email", color: "#34A853", icon: HiOutlineMail },
    ],
  },
];

function Group({ items, hidden }: { items: Item[]; hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="marquee-group flex shrink-0 gap-3 pr-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li
            key={item.name}
            className="flex items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-2 pr-4 text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-200 hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]"
          >
            <span
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${item.color} 14%, var(--color-bg))`, color: item.color }}
            >
              <Icon size={16} />
            </span>
            {item.name}
          </li>
        );
      })}
    </ul>
  );
}

export function Integrations() {
  return (
    <section aria-label="Meeting app integrations" className="py-20 bg-[var(--color-surface)]">
      <div className="max-w-4xl mx-auto px-6">
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
          <p className="text-center text-[var(--color-text-secondary)] text-base mb-14 max-w-lg mx-auto">
            Works with whatever your call runs on, the AI you already use, and the tools your notes belong in.
          </p>
        </AnimateIn>
      </div>

      <div className="space-y-8">
        {rows.map((row, i) => (
          <AnimateIn key={row.label} delay={0.1 + i * 0.08}>
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
              {row.label}
            </p>
            <div className={`marquee overflow-hidden ${row.reverse ? "marquee-reverse" : ""}`}>
              <div
                className="marquee-track flex w-max"
                style={{ ["--marquee-duration" as string]: row.duration }}
              >
                <Group items={row.items} />
                <Group items={row.items} hidden />
              </div>
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  );
}
