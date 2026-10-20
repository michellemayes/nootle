import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { Handshake, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";
import { SourceCitation } from "@/components/SourceCitation";
import { useBooleanSetting } from "@/hooks/useBooleanSetting";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import type { LiveAssistCard, TranscriptSegment } from "@/types";



/** Answers questions during a recording from the knowledge base and past
 * meetings: automatically for questions heard in the meeting (when turned
 * on), and for anything typed in. */
export function LiveAssist({
  meetingId,
  segments,
}: {
  meetingId: string;
  segments: TranscriptSegment[];
}) {
  const navigate = useNavigate();
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const [auto, setAuto] = useBooleanSetting("live_assist", false);
  const [cards, setCards] = useState<LiveAssistCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Segments already looked at; what was there when the panel opened (a
  // resumed recording) is history, not something to answer now.
  const seenRef = useRef<Set<string> | null>(null);
  const queueRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // Questions already on cards; the backend skips them.
  const askedRef = useRef<string[]>([]);
  // Commitments already brought up, and the latest line waiting to be
  // checked for one.
  const remindedRef = useRef<string[]>([]);
  const reminderQueueRef = useRef<TranscriptSegment | null>(null);
  const reminderInFlightRef = useRef(false);

  const llm = { provider: selectedProvider || null, model: selectedModel || null };
  const llmRef = useRef(llm);
  llmRef.current = llm;

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
    <aside className="flex w-80 shrink-0 flex-col border-l" aria-label="Live Assist">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Live Assist</span>
        <label
          className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
          title="Answer questions heard in the meeting from your documents and past meetings"
        >
          Auto
          <Switch checked={auto} onCheckedChange={setAuto} aria-label="Answer questions automatically" />
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4" role="log" aria-live="polite">
          {cards.length === 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {auto
                ? "Listening for questions. When someone asks something your documents or past meetings can answer, the answer shows up here with its sources. Open commitments from earlier meetings are brought up when their owner speaks or their topic comes up."
                : "Ask your documents and past meetings anything below. Turn on Auto to have questions heard in the meeting answered as they come up."}
              {!selectedProvider &&
                " Pick an AI model in the sidebar for written answers; without one, Nootle shows the passages it found."}
            </p>
          )}
          {cards.map((card) => card.commitment_id ? (
            <div key={card.id} className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs">
              <Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="leading-relaxed text-foreground">{card.question}</p>
                {card.sources.map((s, i) => (
                  <SourceCitation key={i} source={s} onOpenMeeting={(id) => navigate(`/meeting/${id}`)} />
                ))}
              </div>
              <button
                onClick={() => setCards((list) => list.filter((c) => c.id !== card.id))}
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
                  onClick={() => setCards((list) => list.filter((c) => c.id !== card.id))}
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
                      onOpenMeeting={(id) => navigate(`/meeting/${id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
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
