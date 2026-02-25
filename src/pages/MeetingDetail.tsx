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
import { useLinearTickets, useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
import type { LinearTicket, LinearTeam, ModelInfo } from "@/types";

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

function CreateTicketButton({
  summaryId,
  existingTicket,
  teams,
  defaultTeamId,
  defaultProjectId,
  providers,
  models,
  onFetchTeams,
  onCreate,
}: {
  summaryId: string;
  existingTicket: LinearTicket | undefined;
  teams: LinearTeam[];
  defaultTeamId: string | null;
  defaultProjectId: string | null;
  providers: string[];
  models: ModelInfo[];
  onFetchTeams: () => void;
  onCreate: (
    summaryId: string,
    teamId: string,
    projectId: string | null,
    provider: string,
    model: string,
  ) => Promise<LinearTicket>;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [selectedProvider, setSelectedProvider] = useState(providers[0] ?? "");
  const [selectedModel, setSelectedModel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTeamId && !teamId) setTeamId(defaultTeamId);
  }, [defaultTeamId]);

  useEffect(() => {
    if (defaultProjectId && !projectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  const { projects } = useLinearProjects(teamId || null);

  const filteredModels = models.filter((m) => m.provider === selectedProvider);

  if (existingTicket) {
    return (
      <a
        href={existingTicket.linear_issue_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {existingTicket.linear_identifier}
      </a>
    );
  }

  const handleCreate = async () => {
    if (!teamId || !selectedProvider || !selectedModel) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(
        summaryId,
        teamId,
        projectId || null,
        selectedProvider,
        selectedModel,
      );
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onFetchTeams();
          setOpen(true);
        }}
      >
        Create Ticket
      </Button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border p-3">
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setProjectId("");
            }}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.key})
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!teamId}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">No project</option>
            {projects.map((p) => (
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
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !teamId || !selectedProvider || !selectedModel}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, loading: meetingLoading } = useMeeting(id!);
  const { segments, loading: transcriptLoading } = useTranscript(id!);
  const { summaries, generateSummary } = useSummaries(id!);
  const { prompts } = usePrompts();
  const { models, providers } = useLLM();
  const { tickets, createTicket } = useLinearTickets(id!);
  const { teams, fetchTeams } = useLinearTeams();
  const { defaultTeamId, defaultProjectId } = useLinearSettings();
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
          {"\uD83D\uDCAC"} Chat
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
                  No transcript available yet
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
              {generating ? "Generating..." : "Generate Summary"}
            </Button>
          </div>

          {/* Summary tabs */}
          <ScrollArea className="flex-1">
            {summaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 gap-2">
                <span className="text-2xl">{"\uD83D\uDCDD"}</span>
                <p className="text-sm text-muted-foreground text-center">
                  No summaries yet. Generate one above.
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
                      <div className="mt-3 flex items-center gap-2">
                        <CreateTicketButton
                          summaryId={s.id}
                          existingTicket={tickets.find((t) => t.summary_id === s.id)}
                          teams={teams}
                          defaultTeamId={defaultTeamId}
                          defaultProjectId={defaultProjectId}
                          providers={providers}
                          models={models}
                          onFetchTeams={fetchTeams}
                          onCreate={createTicket}
                        />
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
