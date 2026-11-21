import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Handshake, Loader2, Send, Sparkles, SquareArrowDownLeft, SquareArrowOutUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";
import { SourceCitation } from "@/components/SourceCitation";
import { ResizeHandle } from "@/components/ResizeHandle";
import { PlaybookPanel, ProgressRing, usePlaybook } from "@/components/Playbook";
import { useBooleanSetting, useSetting } from "@/hooks/useBooleanSetting";
import { useRecordingStore } from "@/hooks/useRecordingStore";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { cn } from "@/lib/utils";
import type { LiveAssistCard, TranscriptSegment } from "@/types";

type Filter = "all" | "answers" | "reminders" | "playbook";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "answers", label: "Q&A" },
  { value: "reminders", label: "Reminders" },
  { value: "playbook", label: "Playbook" },
];

const shows = (filter: string, card: LiveAssistCard) =>
  filter === "all" || (filter === "reminders") === Boolean(card.commitment_id);

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 260;
const MAX_WIDTH = 720;
/** Room the notes keep beside the panel however wide it's dragged. */
const NOTES_MIN_WIDTH = 280;

/** Answers questions during a recording from the knowledge base and past
 * meetings: automatically for questions heard in the meeting (when turned
 * on), and for anything typed in. Beside the notes it can be dragged wider
 * or popped out; `windowed` is the popped-out window, which pops back in. */
export function LiveAssist({
  meetingId,
  segments,
  onOpenMeeting,
  onPopOut,
  windowed = false,
}: {
  meetingId: string;
  segments: TranscriptSegment[];
  onOpenMeeting: (path: string) => void;
  onPopOut: () => void;
  windowed?: boolean;
}) {
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const [auto, setAuto] = useBooleanSetting("live_assist", false);
  const [filter, setFilter] = useSetting("live_assist_filter", "all");
  const [savedWidth, saveWidth] = useSetting("live_assist_width", String(DEFAULT_WIDTH));
  const [width, setWidth] = useState<number | null>(null);
  const [room, setRoom] = useState(MAX_WIDTH);
  const asideRef = useRef<HTMLElement>(null);
  const [cards, setCards] = useRecordingStore<LiveAssistCard[]>("live-assist-cards:", meetingId, []);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Segments already looked at; what was there when the panel opened (a
  // resumed recording) is history, not something to answer now.
  const seenRef = useRef<Set<string> | null>(null);
  const queueRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // Questions already on cards; the backend skips them.
  const askedRef = useRef<string[]>(cards.filter((c) => !c.commitment_id).map((c) => c.question));
  // Commitments already brought up, and the latest line waiting to be
  // checked for one.
  const remindedRef = useRef<string[]>(cards.flatMap((c) => c.commitment_id ?? []));
  const reminderQueueRef = useRef<TranscriptSegment | null>(null);
  const reminderInFlightRef = useRef(false);

  const llm = { provider: selectedProvider || null, model: selectedModel || null };
  const llmRef = useRef(llm);
  llmRef.current = llm;
  const playbook = usePlaybook(meetingId, segments, llmRef);

  const addCard = (card: LiveAssistCard) => {
    if (card.commitment_id) remindedRef.current.push(card.commitment_id);
    else askedRef.current.push(card.question);
    setCards((list) => [card, ...list].slice(0, 20));
  };

  // Open commitments owed by whoever is speaking, or whose topic just came
  // up; the same one at a time, newest line wins, as questions are.
  const drainReminders = async () => {
    if (reminderInFlightRef.current) return;
    while (reminderQueueRef.current) {
      const segment = reminderQueueRef.current;
      reminderQueueRef.current = null;
      reminderInFlightRef.current = true;
      try {
        const reminders = await invoke<LiveAssistCard[]>("live_commitment_reminders", {
          meetingId,
          speaker: segment.speaker_label,
          text: segment.text,
          reminded: remindedRef.current,
        });
        reminders.forEach(addCard);
      } catch {
        // Reminders are a nicety; they fail quietly.
      } finally {
        reminderInFlightRef.current = false;
      }
    }
  };

  // One automatic request at a time; while one runs, only the newest
  // waiting segment is kept, so cards follow the conversation.
  const drain = async () => {
    if (inFlightRef.current) return;
    while (queueRef.current) {
      const text = queueRef.current;
      queueRef.current = null;
      inFlightRef.current = true;
      try {
        const card = await invoke<LiveAssistCard | null>("live_assist", {
          meetingId,
          text,
          automatic: true,
          asked: askedRef.current,
          ...llmRef.current,
        });
        if (card) addCard(card);
      } catch {
        // Unprompted help fails quietly; typed questions show their errors.
      } finally {
        inFlightRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(segments.map((s) => s.id));
      return;
    }
    const fresh = segments.filter((s) => !seenRef.current!.has(s.id));
    fresh.forEach((s) => seenRef.current!.add(s.id));
    if (!auto) return;
    if (fresh.length > 0) {
      reminderQueueRef.current = fresh[fresh.length - 1];
      drainReminders();
    }
    // The backend decides what counts as a question; only segments that
    // could hold one are sent.
    const candidate = [...fresh].reverse().find((s) => s.text.includes("?"));
    if (candidate) {
      queueRef.current = candidate.text;
      drain();
    }
  }, [segments, auto]);

  const dismiss = (id: string) => setCards((list) => list.filter((c) => c.id !== id));

  // The panel never squeezes the notes below NOTES_MIN_WIDTH.
  useEffect(() => {
    const parent = asideRef.current?.parentElement;
    if (windowed || !parent) return;
    const observer = new ResizeObserver(([entry]) => setRoom(entry.contentRect.width - NOTES_MIN_WIDTH));
    observer.observe(parent);
    return () => observer.disconnect();
  }, [windowed]);
  const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, room));
  const panelWidth = Math.min(width ?? (Number(savedWidth) || DEFAULT_WIDTH), maxWidth);

  useEffect(() => {
    if (width === null) return;
    const timer = setTimeout(() => saveWidth(String(width)), 400);
    return () => clearTimeout(timer);
  }, [width, saveWidth]);

  const shown = cards.filter((card) => shows(filter, card));
  const count = (f: Filter) => cards.filter((card) => shows(f, card)).length;

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const text = question.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const card = await invoke<LiveAssistCard | null>("live_assist", {
        meetingId,
        text,
        automatic: false,
        ...llm,
      });
      if (card) addCard(card);
      setQuestion("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      ref={asideRef}
      className={cn("relative flex min-w-0 shrink-0 flex-col", windowed ? "h-full w-full" : "border-l")}
      style={windowed ? undefined : { width: panelWidth }}
      aria-label="Live Assist"
    >
      {!windowed && (
        <ResizeHandle
          width={panelWidth}
          onWidthChange={setWidth}
          min={MIN_WIDTH}
          max={maxWidth}
          side="left"
          label="Resize Live Assist"
        />
      )}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium">Live Assist</span>
        <label
          className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
          title="Answer questions heard in the meeting from your documents and past meetings"
        >
          Auto
          <Switch checked={auto} onCheckedChange={setAuto} aria-label="Answer questions automatically" />
        </label>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onPopOut}
          aria-label={windowed ? "Put back beside notes" : "Pop out"}
          title={windowed ? "Put back beside notes" : "Pop out into its own window"}
          className="-mr-1.5 text-muted-foreground"
        >
          {windowed ? <SquareArrowDownLeft /> : <SquareArrowOutUpRight />}
        </Button>
      </div>
      <div role="radiogroup" aria-label="Show" className="flex gap-1 border-b px-3 py-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              filter === f.value
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <span className="truncate">{f.label}</span>
            {f.value === "playbook"
              ? playbook.items.length > 0 && (
                  <ProgressRing done={playbook.covered.length} total={playbook.items.length} />
                )
              : count(f.value) > 0 && <span className="tabular-nums text-muted-foreground">{count(f.value)}</span>}
          </button>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {filter === "playbook" ? (
          <div className="p-4">
            <PlaybookPanel playbook={playbook} />
          </div>
        ) : (
          <div className="space-y-3 p-4" role="log" aria-live="polite">
            {cards.length > 0 && shown.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {filter === "reminders" ? "No reminders yet." : "No answers yet."}
              </p>
            )}
            {cards.length === 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {auto
                  ? "Listening for questions. When someone asks something your documents or past meetings can answer, the answer shows up here with its sources. Open commitments from earlier meetings are brought up when their owner speaks or their topic comes up."
                  : "Ask your documents and past meetings anything below. Turn on Auto to have questions heard in the meeting answered as they come up."}
                {!selectedProvider &&
                  " Pick an AI model in the sidebar for written answers; without one, Nootle shows the passages it found."}
              </p>
            )}
            {shown.map((card) => card.commitment_id ? (
              <div key={card.id} className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs">
                <Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="leading-relaxed text-foreground">{card.question}</p>
                  {card.sources.map((s, i) => (
                    <SourceCitation key={i} source={s} onOpenMeeting={onOpenMeeting} />
                  ))}
                </div>
                <button
                  onClick={() => dismiss(card.id)}
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div key={card.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs">
                <div className="mb-1.5 flex items-start gap-2">
                  <p className="flex-1 text-xs text-muted-foreground">
                    {card.automatic ? "Heard: " : "You asked: "}
                    <span className="text-foreground">{card.question}</span>
                  </p>
                  <button
                    onClick={() => dismiss(card.id)}
                    aria-label="Dismiss"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {card.answer && <Markdown content={card.answer} />}
                {card.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {card.sources.map((s, i) => (
                      <SourceCitation
                        key={i}
                        source={s}
                        onOpenMeeting={onOpenMeeting}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      <form onSubmit={ask} className="border-t p-3">
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your documents…"
            aria-label="Ask Live Assist"
            className="h-8 text-sm"
          />
          <Button type="submit" size="icon-sm" disabled={busy || !question.trim()} aria-label="Ask">
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </form>
    </aside>
  );
}
