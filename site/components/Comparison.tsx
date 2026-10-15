"use client";

import { motion, type Variants } from "framer-motion";
import { Check, X } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";

type Cell = { ok?: boolean; text?: string };

const yes = (text?: string): Cell => ({ ok: true, text });
const no: Cell = { ok: false };
const note = (text: string): Cell => ({ text });

const columns = ["Nootle", "Granola", "Otter", "Meetily"];

const rows: { label: string; cells: Cell[] }[] = [
  { label: "Records without a bot joining the call", cells: [yes(), yes(), note("Desktop app only"), yes()] },
  { label: "Transcription on your Mac", cells: [yes(), no, no, yes()] },
  { label: "Tells speakers apart, remembers names", cells: [yes("Free"), note("“Me / Them” on desktop"), yes(), note("Pro")] },
  {
    label: "Any AI, including local models or your Claude / ChatGPT subscription",
    cells: [yes(), no, no, yes()],
  },
  {
    label: "Full history as plain files you own",
    cells: [yes(), note("Limited free history; encrypted local cache"), note("Paid plans"), yes()],
  },
  { label: "Answers from your own docs, live in the call", cells: [yes(), no, no, no] },
  {
    label: "MCP server and CLI for agents",
    cells: [yes("Read-only mode available"), note("MCP on paid plans"), note("MCP (enterprise)"), note("—")],
  },
  { label: "Open source", cells: [yes("MIT"), no, no, note("Open core")] },
  {
    label: "Price",
    cells: [note("Free"), note("Free / $14 a month"), note("Free / from $8.33 a month"), note("Free / about $10 a month")],
  },
];

// The table reveals in one pass: the body staggers its rows, and each row pops its icons.
const bodyVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const rowVariants: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };
const iconVariants: Variants = {
  hidden: { scale: 0, rotate: -45 },
  show: (column: number) => ({
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 400, damping: 15, delay: column * 0.05 },
  }),
};

const ICON_TONE = {
  nootle: "bg-[var(--color-accent)] text-white",
  yes: "bg-[var(--color-emerald)]/15 text-[var(--color-emerald)]",
  no: "bg-[var(--color-border)]/60 text-[var(--color-text-secondary)]",
};

function CellView({ cell, column }: { cell: Cell; column: number }) {
  const highlight = column === 0;
  const tone = !cell.ok ? "no" : highlight ? "nootle" : "yes";
  return (
    <span className="flex flex-col items-center gap-1 text-center">
      {cell.ok !== undefined && (
        <motion.span
          variants={iconVariants}
          custom={column}
          className={`flex w-6 h-6 items-center justify-center rounded-full ${ICON_TONE[tone]}`}
        >
          {cell.ok ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <X className="w-3.5 h-3.5" strokeWidth={3} />}
          <span className="sr-only">{cell.ok ? "Yes" : "No"}</span>
        </motion.span>
      )}
      {cell.text && (
        <span className={`text-xs ${highlight ? "text-[var(--color-text)] font-medium" : "text-[var(--color-text-secondary)]"}`}>
          {cell.text}
        </span>
      )}
    </span>
  );
}

export function Comparison() {
  return (
    <section id="compare" aria-label="Why choose Nootle" className="py-24 px-6 scroll-mt-16">
      <div className="max-w-5xl mx-auto">
        <AnimateIn>
          <h2 className="font-[family-name:var(--font-outfit)] text-3xl md:text-4xl font-bold text-center mb-4 text-[var(--color-text)]">
            How Nootle compares
          </h2>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <p className="text-center text-[var(--color-text-secondary)] text-base mb-12 max-w-2xl mx-auto">
            Cloud recorders like Otter.ai and Fireflies.ai upload your audio to their servers. Nootle records and
            transcribes on your Mac, works offline for capture, and costs nothing.
          </p>
        </AnimateIn>

        <AnimateIn delay={0.15}>
          <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sr-only">
                    Feature
                  </th>
                  {columns.map((col, i) => (
                    <th
                      key={col}
                      scope="col"
                      className={`w-[17%] px-3 py-4 font-[family-name:var(--font-outfit)] font-semibold ${
                        i === 0
                          ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-base"
                          : "text-[var(--color-text)]"
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody
                variants={bodyVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-40px" }}
              >
                {rows.map((row) => (
                  <motion.tr
                    key={row.label}
                    variants={rowVariants}
                    className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-elevated)]/50"
                  >
                    <th scope="row" className="px-5 py-3.5 text-left font-medium text-[var(--color-text)]">
                      {row.label}
                    </th>
                    {row.cells.map((cell, c) => (
                      <td key={c} className={`px-3 py-3.5 align-middle ${c === 0 ? "bg-[var(--color-accent)]/10" : ""}`}>
                        <CellView cell={cell} column={c} />
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-center text-[var(--color-text-secondary)]">
            Competitor details are as of October 2026 and change often; check their sites.
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}
