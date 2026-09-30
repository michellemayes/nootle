import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { useAnalytics } from "@/hooks/useAnalytics";
import { BarChart3, RotateCw, Users, Timer, MessageCircleQuestion, Zap } from "lucide-react";
import { formatMs } from "@/lib/utils";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";

// Same order as the speaker colors in MeetingDetail, so a speaker keeps one
// color between the transcript and these bars.
const barColors = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
];

export function AnalyticsPanel({
  meetingId,
}: {
  meetingId: string;
}) {
  const {
    speakers,
    sentiment,
    engagement,
    sentimentRunning,
    loading,
    error,
    computeAnalytics,
    computeSentiment,
  } = useAnalytics(meetingId);

  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const [computing, setComputing] = useState(false);
  const [startingSentiment, setStartingSentiment] = useState(false);
  // The backend tracks in-flight jobs, so progress survives switching tabs.
  const analyzingSentiment = startingSentiment || sentimentRunning;
  const [actionError, setActionError] = useState<string | null>(null);

  const hasSpeakers = speakers.length > 0;
  const hasSentiment = sentiment.length > 0;
  const totalTalkTime = speakers.reduce((sum, s) => sum + s.talk_time_ms, 0);
  const totalInterruptions = speakers.reduce((sum, s) => sum + s.interruption_count, 0);
  const sentimentDuration = hasSentiment
    ? sentiment[sentiment.length - 1].end_ms - sentiment[0].start_ms
    : 0;

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
    setStartingSentiment(true);
    setActionError(null);
    try {
      await computeSentiment(selectedProvider, selectedModel);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setStartingSentiment(false);
    }
  };

  if (loading) {
    return <LoadingState message={LOADING_COPY.analytics} />;
  }

  if (!hasSpeakers && !engagement) {
    return (
      <EmptyState
        icon={BarChart3}
        size="panel"
        description="No analytics yet. Compute talk time, interruptions, and engagement from the transcript."
        action={
          <div className="flex flex-col items-center gap-2">
            <Button size="sm" onClick={handleCompute} disabled={computing}>
              {computing ? "Computing…" : "Compute analytics"}
            </Button>
            {(actionError || error) && (
              <p className="text-xs text-destructive">{actionError || error}</p>
            )}
          </div>
        }
      />
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-6 p-5">
        {hasSpeakers && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Talk time</h3>
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
                        className={`h-3 rounded-full ${color} transition-[width] duration-300`}
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
              <span className="text-xs">Talk time</span>
            </div>
            <p className="text-lg font-semibold">{formatMs(totalTalkTime)}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">Speakers</span>
            </div>
            <p className="text-lg font-semibold">{speakers.length}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-xs">Interruptions</span>
            </div>
            <p className="text-lg font-semibold">{totalInterruptions}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              <span className="text-xs">Questions</span>
            </div>
            <p className="text-lg font-semibold">{engagement?.question_count ?? 0}</p>
          </div>
        </div>

        {engagement && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Engagement</h3>
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  engagement.engagement_level === "high"
                    ? "success"
                    : engagement.engagement_level === "medium"
                      ? "warning"
                      : "destructive"
                }
              >
                {engagement.engagement_level.charAt(0).toUpperCase() +
                  engagement.engagement_level.slice(1)}{" "}
                engagement
              </Badge>
              <span className="text-xs text-muted-foreground">
                {Math.round(engagement.participation_balance * 100)}% balanced
              </span>
            </div>
          </div>
        )}

        {hasSentiment && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Sentiment timeline</h3>
            <div className="flex h-4 w-full overflow-hidden rounded-full">
              {sentiment.map((seg) => {
                const segDuration = seg.end_ms - seg.start_ms;
                const widthPct =
                  sentimentDuration > 0 ? (segDuration / sentimentDuration) * 100 : 0;
                const color =
                  seg.sentiment === "positive"
                    ? "bg-success"
                    : seg.sentiment === "negative"
                      ? "bg-destructive"
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
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success" /> Positive
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Neutral
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-destructive" /> Negative
              </span>
            </div>
          </div>
        )}

        <div className="border-t pt-4 flex flex-wrap gap-2">
          <Button
            variant={hasSentiment ? "outline" : "default"}
            size="sm"
            onClick={handleAnalyzeSentiment}
            disabled={analyzingSentiment || !selectedProvider || !selectedModel}
          >
            <RotateCw className={`h-3 w-3 mr-1 ${analyzingSentiment ? "animate-spin" : ""}`} />
            {analyzingSentiment
              ? "Analyzing…"
              : hasSentiment
                ? "Re-analyze sentiment"
                : "Analyze sentiment"}
          </Button>
          {hasSpeakers && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCompute}
              disabled={computing}
            >
              <RotateCw className={`h-3 w-3 mr-1 ${computing ? "animate-spin" : ""}`} />
              {computing ? "Recomputing…" : "Recompute analytics"}
            </Button>
          )}
        </div>

        {(actionError || error) && (
          <p className="text-xs text-destructive text-center">{actionError || error}</p>
        )}
      </div>
    </ScrollArea>
  );
}
