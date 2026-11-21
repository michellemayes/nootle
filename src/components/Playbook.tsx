import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pencil } from "lucide-react";
import { ActionItemCheckbox } from "@/components/ActionItemCheckbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSetting } from "@/hooks/useBooleanSetting";
import { useRecordingStore } from "@/hooks/useRecordingStore";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/types";

export const PLAYBOOKS: Record<string, { label: string; items: string[] }> = {
  discovery: {
    label: "Discovery call",
    items: ["Current process and pain", "Impact of the problem", "Budget", "Decision makers", "Timeline", "Next steps agreed"],
  },
  one_on_one: {
    label: "1:1",
    items: ["Wins since last time", "Blockers", "Priorities for the week", "Feedback", "Career growth"],
  },
  interview: {
    label: "Interview",
    items: [
      "Background and current role",
      "Why they're looking",
      "A project they're proud of",
      "Questions from the candidate",
      "Next steps and timeline",
    ],
  },
};

/** Time between checks of the conversation against the playbook: key words
 * on every check, the model on every third. */
const CHECK_EVERY_MS = 20_000;
const MODEL_EVERY_MS = 60_000;

type Llm = { provider: string | null; model: string | null };

/** The chosen playbook and which of its topics the recording has covered.
 * New lines are checked at most every CHECK_EVERY_MS; topics can also be
 * ticked by hand. */
export function usePlaybook(meetingId: string, segments: TranscriptSegment[], llmRef: MutableRefObject<Llm>) {
  const [choice, setChoice] = useSetting("live_assist_playbook", "none");
  const [custom, setCustom] = useSetting("live_assist_playbook_custom", "");
  const [covered, setCovered] = useRecordingStore<string[]>("playbook-covered:", meetingId, []);

  const items = useMemo(
    () =>
      choice === "custom"
        ? custom.split("\n").map((l) => l.trim()).filter(Boolean)
        : (PLAYBOOKS[choice]?.items ?? []),
    [choice, custom],
  );
  const done = items.filter((i) => covered.includes(i));
  const open = items.filter((i) => !covered.includes(i));
  const openKey = open.join("\n");

  const lastCheckRef = useRef(0);
  const lastModelRef = useRef(0);
  const inFlightRef = useRef(false);
  useEffect(() => {
    if (open.length === 0 || segments.length === 0) return;
    const check = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const now = Date.now();
      lastCheckRef.current = now;
      const withModel = now - lastModelRef.current >= MODEL_EVERY_MS;
      if (withModel) lastModelRef.current = now;
      try {
        const found = await invoke<number[]>("playbook_coverage", {
          meetingId,
          items: open,
          ...(withModel ? llmRef.current : {}),
        });
        if (found.length > 0) setCovered((c) => [...new Set([...c, ...found.map((n) => open[n])])]);
      } catch {
        // Coverage is a nicety; a failed check waits for the next line.
      } finally {
        inFlightRef.current = false;
      }
    };
    const timer = setTimeout(check, Math.max(0, lastCheckRef.current + CHECK_EVERY_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [meetingId, segments.length, openKey]);

  const toggle = (item: string) =>
    setCovered((c) => (c.includes(item) ? c.filter((i) => i !== item) : [...c, item]));

  return { choice, setChoice, custom, setCustom, items, covered: done, toggle };
}

/** How much of the playbook is covered, small enough for a tab. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 5;
  const length = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0 -rotate-90" role="img" aria-label={`${done} of ${total} covered`}>
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-muted-foreground/25" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(done / total) * length} ${length}`}
        className={cn("transition-[stroke-dasharray] duration-300", done > 0 ? "stroke-primary" : "stroke-transparent")}
      />
    </svg>
  );
}

export type PlaybookState = ReturnType<typeof usePlaybook>;

/** The Playbook tab of Live Assist: pick a checklist, watch it fill in. */
export function PlaybookPanel({ playbook }: { playbook: PlaybookState }) {
  const { choice, setChoice, custom, setCustom, items, covered, toggle } = playbook;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(custom);
  const showEditor = choice === "custom" && (editing || items.length === 0);

  const save = () => {
    setCustom(draft);
    setEditing(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          size="xs"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          aria-label="Playbook"
          containerClassName="flex-1"
        >
          <option value="none">No playbook</option>
          {Object.entries(PLAYBOOKS).map(([value, p]) => (
            <option key={value} value={value}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </Select>
        {choice === "custom" && !showEditor && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => {
              setDraft(custom);
              setEditing(true);
            }}
            aria-label="Edit playbook"
            className="text-muted-foreground"
          >
            <Pencil />
          </Button>
        )}
      </div>

      {choice === "none" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pick the topics this call should cover. Each one ticks off when the conversation gets to it.
        </p>
      )}

      {showEditor && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"One topic per line\nBudget\nTimeline"}
            aria-label="Playbook topics"
            rows={6}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            {items.length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button size="xs" onClick={save} disabled={!draft.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      {!showEditor && items.length > 0 && (
        <>
          <div className="space-y-1.5">
            <p className="text-xs tabular-nums text-muted-foreground">
              {covered.length === items.length ? "All covered" : `${covered.length} of ${items.length} covered`}
            </p>
            <Progress percent={(covered.length / items.length) * 100} className="h-1.5" />
          </div>
          <ul className="space-y-2">
            {items.map((item) => {
              const done = covered.includes(item);
              return (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <ActionItemCheckbox done={done} onToggle={() => toggle(item)} label={item} />
                  <span className={cn("min-w-0 flex-1", done && "text-muted-foreground line-through")}>{item}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
