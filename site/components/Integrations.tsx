"use client";

import { motion } from "framer-motion";
import { SiZoom, SiGooglemeet, SiSlack, SiLinear, SiNotion, SiConfluence, SiGithub, SiAsana, SiObsidian } from "react-icons/si";
import { BsMicrosoftTeams } from "react-icons/bs";
import { HiOutlineMail } from "react-icons/hi";
import type { IconType } from "react-icons";

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
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.p
          className="font-[family-name:var(--font-syne)] text-sm font-semibold tracking-[0.2em] uppercase text-center mb-4 text-[var(--color-text-secondary)]"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          Integrations
        </motion.p>
        <motion.h2
          className="font-[family-name:var(--font-syne)] text-3xl md:text-4xl font-bold text-center mb-4 text-[var(--color-text)]"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          Works with your stack
        </motion.h2>
        <motion.p
          className="text-center text-[var(--color-text-secondary)] text-base mb-14 max-w-md mx-auto"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Auto-detects meetings and pushes notes to the tools you already use.
        </motion.p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {integrations.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.name}
                className="group relative flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] cursor-default overflow-hidden"
                whileHover={{
                  boxShadow: `0 0 40px -8px ${item.color}33`,
                  borderColor: `${item.color}44`,
                  y: -4,
                  transition: { duration: 0.15 },
                }}
                initial={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.4,
                  delay: i * 0.05,
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
              >
                {/* Subtle glow behind icon on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 40%, ${item.color}15 0%, transparent 70%)`,
                  }}
                />
                <div
                  className="relative flex items-center justify-center w-14 h-14 rounded-xl transition-transform duration-150 group-hover:scale-110"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${item.color} 12%, var(--color-bg))`,
                    color: item.color,
                  }}
                >
                  <Icon size={28} />
                </div>
                <span className="relative text-sm font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)] transition-colors duration-150">
                  {item.name}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
