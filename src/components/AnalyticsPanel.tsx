import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnalytics } from "@/hooks/useAnalytics";
import { BarChart3, RotateCw, Users, Timer, MessageCircleQuestion, Zap } from "lucide-react";
import type { ModelInfo } from "@/types";

const barColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
];

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AnalyticsPanel({
  meetingId,
  providers,
  models,
}: {
  meetingId: string;
  providers: string[];
  models: ModelInfo[];
}) {
  const {
    speakers,
    sentiment,
    engagement,
    loading,
    error,
    computeAnalytics,
    computeSentiment,
  } = useAnalytics(meetingId);

  const [selectedProvider, setSelectedProvider] = useState(providers[0] ?? "");
  const [selectedModel, setSelectedModel] = useState("");
  const [computing, setComputing] = useState(false);
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (selectedProvider && models.length > 0 && !selectedModel) {
      const providerModels = models.filter((m) => m.provider === selectedProvider);
      if (providerModels.length > 0) {
        setSelectedModel(providerModels[0].id);
      }
    }
  }, [selectedProvider, models, selectedModel]);

  const filteredModels = models.filter((m) => m.provider === selectedProvider);

  const hasSpeakers = speakers.length > 0;
  const hasSentiment = sentiment.length > 0;
  const totalTalkTime = speakers.reduce((sum, s) => sum + s.talk_time_ms, 0);
  const totalInterruptions = speakers.reduce((sum, s) => sum + s.interruption_count, 0);

  const handleCompute = async () => {
    setComputing(true);
    setActionError(null);
    try {
      await computeAnalytics();
    } catch (err) {
      setActionError(String(err));
    } finally {
      setComputing(false);
    }
  };

  const handleAnalyzeSentiment = async () => {
    if (!selectedProvider || !selectedModel) return;
    setAnalyzingSentiment(true);
    setActionError(null);
    try {
      await computeSentiment(selectedProvider, selectedModel);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setAnalyzingSentiment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (!hasSpeakers && !engagement) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          No analytics yet. Compute talk-time, engagement, and more from the transcript.
        </p>
        <Button
          size="sm"
          onClick={handleCompute}
          disabled={computing}
        >
          {computing ? "Computing..." : "Compute Analytics"}
        </Button>
        {(actionError || error) && (
          <p className="text-xs text-destructive text-center">{actionError || error}</p>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-6 p-4">
        {hasSpeakers && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Talk Time</h3>
            <div className="space-y-2">
              {speakers.map((speaker, i) => {
                const pct = totalTalkTime > 0 ? (speaker.talk_time_ms / totalTalkTime) * 100 : 0;
                const color = barColors[i % barColors.length];
                return (
                  <div key={speaker.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{speaker.speaker_label}</span>
                      <span className="text-muted-foreground">
                        {formatMs(speaker.talk_time_ms)} ({Math.round(pct)}%)
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted">
                      <div
                        className={`h-3 rounded-full ${color} transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-semibold">{formatMs(totalTalkTime)}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">Speakers</span>
            </div>
            <p className="text-lg font-semibold">{speakers.length}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">Interruptions</span>
            </div>
            <p className="text-lg font-semibold">{totalInterruptions}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">Questions</span>
            </div>
            <p className="text-lg font-semibold">{engagement?.question_count ?? 0}</p>
          </div>
        </div>

        {engagement && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Engagement</h3>
            <div className="flex items-center gap-3">
              <Badge
                className={
                  engagement.engagement_level === "high"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : engagement.engagement_level === "medium"
                      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30"
                }
              >
                {engagement.engagement_level.charAt(0).toUpperCase() +
                  engagement.engagement_level.slice(1)}{" "}
                Engagement
              </Badge>
              <span className="text-xs text-muted-foreground">
                {Math.round(engagement.participation_balance * 100)}% balanced
              </span>
            </div>
          </div>
        )}

        {hasSentiment && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Sentiment Timeline</h3>
            <div className="flex h-4 w-full overflow-hidden rounded-full">
              {sentiment.map((seg) => {
                const totalDuration =
                  sentiment.length > 0
                    ? sentiment[sentiment.length - 1].end_ms - sentiment[0].start_ms
                    : 1;
                const segDuration = seg.end_ms - seg.start_ms;
                const widthPct = totalDuration > 0 ? (segDuration / totalDuration) * 100 : 0;
                const color =
                  seg.sentiment === "positive"
                    ? "bg-green-500"
                    : seg.sentiment === "negative"
                      ? "bg-red-500"
                      : "bg-muted-foreground/40";
                return (
                  <div
                    key={seg.id}
                    className={`h-full ${color}`}
                    style={{ width: `${widthPct}%` }}
                    title={`${seg.sentiment} (${formatMs(seg.start_ms)} - ${formatMs(seg.end_ms)})`}
                  />
                );
              })}
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" /> Positive
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Neutral
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Negative
              </span>
            </div>
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <h3 className="text-sm font-semibold">Sentiment Analysis</h3>
          <div className="flex gap-2">
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setSelectedModel("");
              }}
              className="h-8 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Provider</option>
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Model</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <Button
            variant={hasSentiment ? "outline" : "default"}
            size="sm"
            className="w-full"
            onClick={handleAnalyzeSentiment}
            disabled={analyzingSentiment || !selectedProvider || !selectedModel}
          >
            <RotateCw className={`h-3 w-3 mr-1 ${analyzingSentiment ? "animate-spin" : ""}`} />
            {analyzingSentiment
              ? "Analyzing..."
              : hasSentiment
                ? "Re-analyze Sentiment"
                : "Analyze Sentiment"}
          </Button>
        </div>

        {hasSpeakers && (
          <div className="border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleCompute}
              disabled={computing}
            >
              <RotateCw className={`h-3 w-3 mr-1 ${computing ? "animate-spin" : ""}`} />
              {computing ? "Re-computing..." : "Re-compute Analytics"}
            </Button>
          </div>
        )}

        {(actionError || error) && (
          <p className="text-xs text-destructive text-center">{actionError || error}</p>
        )}
      </div>
    </ScrollArea>
  );
}
