import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, GraduationCap, Lightbulb, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible } from "@/components/Collapsible";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { useMeetingCoach, type CoachMetrics, type CoachTrendPoint } from "@/hooks/useCoach";
import { formatDate, formatMs, plural } from "@/lib/utils";

/** Counts as whole numbers; averages of them to one decimal. */
const count = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

type NumericMetric = {
  [K in keyof CoachMetrics]: CoachMetrics[K] extends number ? K : never;
}[keyof CoachMetrics];

/** The metrics the card and the trends show, in order. */
const METRICS: {
  key: NumericMetric;
  label: string;
  format: (v: number) => string;
  /** A second line on the card, from the meeting's other numbers. */
  detail: (m: CoachMetrics) => string;
}[] = [
  { key: "talk_share", label: "Your talk share", format: (v) => `${Math.round(v * 100)}%`, detail: (m) => `${formatMs(m.talk_time_ms)} speaking` },
  { key: "words_per_minute", label: "Pace", format: (v) => `${Math.round(v)} wpm`, detail: (m) => plural(m.words, "word") },
  { key: "interruptions", label: "You interrupted", format: count, detail: (m) => `Interrupted ${plural(m.times_interrupted, "time")}` },
  { key: "questions", label: "Questions asked", format: count, detail: (m) => plural(m.statements, "statement") },
  {
    key: "fillers_per_minute",
    label: "Filler words",
    format: (v) => `${v.toFixed(1)}/min`,
    detail: (m) =>
      m.top_fillers.length === 0
        ? "None heard"
        : m.top_fillers.slice(0, 3).map(([f, n]) => `“${f}” ×${n}`).join(", "),
  },
  { key: "longest_monologue_ms", label: "Longest monologue", format: formatMs, detail: (m) => `${m.long_monologues} over 2 min` },
];

function PrivateBadge() {
  return (
    <Badge variant="secondary" size="sm" title="Coach is computed on this Mac and never shared, exported, or sent to workflows">
      <Lock />
      Private · only you see this
    </Badge>
  );
}

/** How you showed up in this meeting, with one optional thing to try next
 * time. Collapsible, and only shown when Meeting Coach is on. */
export function CoachCard({ meetingId }: { meetingId: string }) {
  const { coach, loading, suggestTip } = useMeetingCoach(meetingId);
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const [open, setOpen] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  const handleSuggest = async () => {
    if (!selectedProvider || !selectedModel) return;
    setSuggesting(true);
    setError(null);
    try {
      await suggestTip(selectedProvider, selectedModel);
    } catch (err) {
      setError(String(err));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Your coach</span>
        <PrivateBadge />
      </button>
      <Collapsible open={open}>
        {!coach ? (
          <p className="text-xs text-muted-foreground">
            Nootle couldn't tell which parts of this meeting were you. Coach works on calls, where
            your microphone is recorded as “You”.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {METRICS.map(({ key, label, format, detail }) => (
                <div key={key} className="rounded-md border bg-background p-2.5 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-base font-semibold">{format(coach.metrics[key])}</p>
                  <p className="text-xs text-muted-foreground truncate">{detail(coach.metrics)}</p>
                </div>
              ))}
            </div>
            {coach.tip && (
              <div className="flex gap-2 rounded-md bg-background p-2.5 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  <span className="font-medium">Try next time: </span>
                  {coach.tip}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={suggesting || !selectedProvider || !selectedModel}
                title="Sends only these numbers to your selected model, never the transcript"
              >
                <RotateCw className={`h-3 w-3 mr-1 ${suggesting ? "animate-spin" : ""}`} />
                {suggesting ? "Thinking…" : coach.tip ? "Another tip" : "Suggest one thing to try"}
              </Button>
              <Link to="/people?coach=1" className="text-xs text-muted-foreground hover:underline">
                See your trends →
              </Link>
            </div>
            {!selectedProvider && (
              <p className="text-xs text-muted-foreground">Pick a model to get a tip.</p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </Collapsible>
    </div>
  );
}

/** A small line of one metric across meetings, oldest to newest, with a
 * dot per meeting (hover for which). */
function Sparkline({
  points,
  values,
  metric,
}: {
  points: CoachTrendPoint[];
  values: number[];
  metric: (typeof METRICS)[number];
}) {
  const width = 160;
  const height = 40;
  const pad = 5;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const x = (i: number) => (points.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (points.length - 1));
  const y = (v: number) => height - pad - ((v - min) / range) * (height - 2 * pad);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full text-chart-1" role="img" aria-label={`${metric.label} over your last ${plural(points.length, "meeting")}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => (
        <circle key={points[i].meeting_id} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4 : 2.5} className="fill-current stroke-card" strokeWidth={1.5}>
          <title>{`${points[i].title} (${formatDate(points[i].start_time)}): ${metric.format(v)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Your coach metrics across recent meetings: the latest value, your
 * average, and a sparkline for each. */
export function CoachTrends({ points }: { points: CoachTrendPoint[] | null }) {
  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">You</h2>
          <PrivateBadge />
        </div>
        <p className="text-sm text-muted-foreground">
          How you've shown up in your last {points?.length ? plural(points.length, "meeting") : "meetings"}, worked out
          on this Mac from the parts of each call that were you. Never shared or exported
        </p>
      </div>
      {points === null ? null : points.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No meetings with you in them yet. Record a call and your coach card will appear on its Analytics tab.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {METRICS.map((metric) => {
            const values = points.map((p) => p[metric.key]);
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return (
              <div key={metric.key} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="text-xs text-muted-foreground">avg {metric.format(avg)}</p>
                </div>
                <p className="text-lg font-semibold">{metric.format(values[values.length - 1])}</p>
                <Sparkline points={points} values={values} metric={metric} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
