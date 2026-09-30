import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Flame, PartyPopper, X } from "lucide-react";
import { computeMomentum, type Momentum } from "@/lib/momentum";
import type { Meeting } from "@/types";

const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
const CONFETTI_COLORS = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** This recording was the first today and pushed the streak past a day. */
const extendedStreak = (m: Momentum) => m.today === 1 && m.streak > 1;

/** Worth confetti: first ever, a round-number milestone, or a streak extended. */
const isBigMoment = (m: Momentum) => MILESTONES.includes(m.total) || extendedStreak(m);

function headline(m: Momentum): string {
  if (m.total === 1) return "Your first meeting is in the bag!";
  if (MILESTONES.includes(m.total)) return `Meeting #${m.total}. Look at you go.`;
  if (extendedStreak(m)) return `${m.streak}-day streak! Keep it going.`;
  return "Meeting captured.";
}

function subline(m: Momentum): string {
  const next = "Summary and insights are on their way.";
  if (m.streak > 1 && !extendedStreak(m)) return `${m.streak}-day streak · ${m.thisWeek} this week. ${next}`;
  if (m.thisWeek > 1) return `${m.thisWeek} meetings this week. ${next}`;
  return `Transcript's saved. ${next}`;
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 360,
        y: 80 + Math.random() * 120,
        rotate: Math.random() * 540 - 270,
        delay: Math.random() * 0.15,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 5 + Math.random() * 4,
        h: 8 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-4" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[1px]"
          style={{ width: p.w, height: p.h, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, -40, p.y], opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: 1.3, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/**
 * A short, celebratory toast shown right after a recording is stopped, so
 * finishing a meeting feels like a win rather than a page change.
 */
export function RecordingCelebration() {
  const location = useLocation();
  const navigate = useNavigate();
  const [momentum, setMomentum] = useState<Momentum | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!(location.state as { justRecorded?: boolean } | null)?.justRecorded) return;
    // Clear the flag so a reload or back-navigation doesn't celebrate twice.
    navigate(location.pathname, { replace: true, state: null });
    invoke<Meeting[]>("list_meetings", { search: null, includeArchived: true })
      .then((meetings) => {
        setMomentum(computeMomentum(meetings));
        setVisible(true);
      })
      .catch(() => {});
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && momentum && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 top-10 z-50 flex justify-center"
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <div
            role="status"
            className="pointer-events-auto relative flex max-w-md items-center gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-xl"
          >
            {isBigMoment(momentum) && <Confetti />}
            <motion.span
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.1 }}
            >
              {momentum.streak > 1 ? <Flame className="h-4.5 w-4.5" /> : <PartyPopper className="h-4.5 w-4.5" />}
            </motion.span>
            <div className="relative min-w-0">
              <p className="text-sm font-semibold">{headline(momentum)}</p>
              <p className="text-xs text-muted-foreground">{subline(momentum)}</p>
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="relative ml-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
