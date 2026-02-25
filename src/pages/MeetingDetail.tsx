import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/components/ChatPanel";
import { useMeeting } from "@/hooks/useMeetings";
import { useTranscript } from "@/hooks/useTranscripts";
import { useSummaries } from "@/hooks/useSummaries";
import { usePrompts } from "@/hooks/usePrompts";
import { useLLM } from "@/hooks/useLLM";

const speakerColors = [
  "text-blue-400",
  "text-green-400",
  "text-amber-400",
  "text-purple-400",
  "text-pink-400",
  "text-cyan-400",
];

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, loading: meetingLoading } = useMeeting(id!);
  const { segments, loading: transcriptLoading } = useTranscript(id!);
  const { summaries, generateSummary } = useSummaries(id!);
  const { prompts } = usePrompts();
  const { models, providers } = useLLM();
  const [chatOpen, setChatOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  // Default selections
  useEffect(() => {
    if (prompts.length > 0 && !selectedPrompt) {
      setSelectedPrompt(prompts[0].id);
    }
  }, [prompts, selectedPrompt]);

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (selectedProvider && models.length > 0 && !selectedModel) {
      const providerModels = models.filter(
        (m) => m.provider === selectedProvider,
      );
      if (providerModels.length > 0) {
        setSelectedModel(providerModels[0].id);
      }
    }
  }, [selectedProvider, models, selectedModel]);

  // Speaker color map
  const speakerMap = new Map<string, string>();
  segments.forEach((seg) => {
    if (!speakerMap.has(seg.speaker_label)) {
      speakerMap.set(
        seg.speaker_label,
        speakerColors[speakerMap.size % speakerColors.length],
      );
    }
  });

  const handleGenerate = async () => {
    if (!selectedPrompt || !selectedProvider || !selectedModel) return;
    setGenerating(true);
    try {
      await generateSummary(selectedPrompt, selectedProvider, selectedModel);
    } catch {
      // Error handling could be improved
    } finally {
      setGenerating(false);
    }
  };

  if (meetingLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading meeting...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Meeting not found</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Back to Meetings
        </Button>
      </div>
    );
  }

  const filteredModels = models.filter(
    (m) => m.provider === selectedProvider,
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            {"\u2190"} Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(meeting.start_time)}
            </p>
          </div>
          <Badge variant="outline">{meeting.status}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
          {"\uD83D\uDCAC"} Ask Nootle
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Transcript - left column */}
        <div className="flex flex-1 flex-col border-r">
          <div className="px-6 py-3 border-b">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Transcript
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              {transcriptLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading transcript...
                </p>
              ) : segments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No transcript here — this one's a mystery
                </p>
              ) : (
                segments.map((seg) => (
                  <div key={seg.id} className="group flex gap-3">
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground font-mono tabular-nums w-12">
                      {formatMs(seg.start_ms)}
                    </span>
                    <div className="min-w-0">
                      <span
                        className={`text-sm font-semibold ${speakerMap.get(seg.speaker_label) ?? "text-foreground"}`}
                      >
                        {seg.speaker_label}
                      </span>
                      <p className="text-sm text-foreground leading-relaxed">
                        {seg.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Summaries - right column */}
        <div className="flex w-96 flex-col">
          <div className="px-6 py-3 border-b">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Summaries
            </h2>
          </div>

          {/* Generate controls */}
          <div className="space-y-2 p-4 border-b">
            <select
              value={selectedPrompt}
              onChange={(e) => setSelectedPrompt(e.target.value)}
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="">Select prompt</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-8 flex-1 rounded-md border bg-transparent px-2 text-xs"
              >
                <option value="">Model</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleGenerate}
              disabled={generating || !selectedPrompt || !selectedProvider || !selectedModel}
            >
              {generating ? "Cooking..." : "Cook Up a Summary"}
            </Button>
          </div>

          {/* Summary tabs */}
          <ScrollArea className="flex-1">
            {summaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 gap-2">
                <span className="text-2xl">{"\uD83D\uDCDD"}</span>
                <p className="text-sm text-muted-foreground text-center">
                  Nothing cooked up yet. Pick a prompt and let it rip.
                </p>
              </div>
            ) : (
              <Tabs defaultValue={summaries[0]?.id} className="p-4">
                <TabsList className="w-full">
                  {summaries.map((s, i) => (
                    <TabsTrigger key={s.id} value={s.id}>
                      Summary {i + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {summaries.map((s) => (
                  <TabsContent key={s.id} value={s.id}>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{s.provider}/{s.model}</span>
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                        {s.content}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Audio player skeleton */}
      <div className="border-t px-8 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" disabled>
            {"\u25B6"}
          </Button>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-1.5 w-0 rounded-full bg-primary" />
            </div>
          </div>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            00:00 / 00:00
          </span>
        </div>
      </div>

      {/* Chat panel */}
      <ChatPanel
        meetingId={id!}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </motion.div>
  );
}
