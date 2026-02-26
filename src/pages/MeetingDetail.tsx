import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { SparkleEffect } from "@/components/SparkleEffect";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/components/ChatPanel";
import { useMeeting } from "@/hooks/useMeetings";
import { useTranscript } from "@/hooks/useTranscripts";
import { useSummaries } from "@/hooks/useSummaries";
import { useInsights } from "@/hooks/useInsights";
import { usePrompts } from "@/hooks/usePrompts";
import { useLLM } from "@/hooks/useLLM";
import { useLinearTickets, useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
import type { LinearTicket, LinearTeam, LinearProject, ModelInfo, InsightWithActionItem } from "@/types";
import { ArrowLeft, MessageSquare, FileText, Play, Check, RotateCw, Lightbulb, ListChecks, Star } from "lucide-react";

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

function ActionItemRow({
  item,
  onToggle,
  onUpdate,
}: {
  item: InsightWithActionItem;
  onToggle: (actionItemId: string, currentStatus: string) => void;
  onUpdate: (actionItemId: string, assignee: string | null, dueDate: string | null) => void;
}) {
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [assignee, setAssignee] = useState(item.assignee ?? "");
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDate, setDueDate] = useState(item.due_date ?? "");
  const isDone = item.status === "done";

  const handleAssigneeSave = () => {
    setEditingAssignee(false);
    if (item.action_item_id) {
      onUpdate(item.action_item_id, assignee || null, item.due_date);
    }
  };

  const handleDueDateSave = () => {
    setEditingDueDate(false);
    if (item.action_item_id) {
      onUpdate(item.action_item_id, item.assignee, dueDate || null);
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-md border p-3">
      <button
        onClick={() => item.action_item_id && onToggle(item.action_item_id, item.status ?? "open")}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          isDone
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground hover:border-primary"
        }`}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`text-sm leading-relaxed ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.content}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDone ? "secondary" : "outline"} className="text-[10px]">
            {isDone ? "Done" : "Open"}
          </Badge>
          {editingAssignee ? (
            <input
              autoFocus
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={handleAssigneeSave}
              onKeyDown={(e) => e.key === "Enter" && handleAssigneeSave()}
              placeholder="Assignee"
              className="h-5 w-24 rounded border bg-transparent px-1 text-[10px]"
            />
          ) : (
            <button
              onClick={() => setEditingAssignee(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              {item.assignee || "Assign"}
            </button>
          )}
          {editingDueDate ? (
            <input
              autoFocus
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onBlur={handleDueDateSave}
              className="h-5 rounded border bg-transparent px-1 text-[10px]"
            />
          ) : (
            <button
              onClick={() => setEditingDueDate(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              {item.due_date || "Due date"}
            </button>
          )}
          {item.transcript_start_ms != null && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatMs(item.transcript_start_ms)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightSection({
  title,
  icon: Icon,
  items,
  defaultOpen = true,
  renderItem,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: InsightWithActionItem[];
  defaultOpen?: boolean;
  renderItem: (item: InsightWithActionItem) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" className="text-[10px]">
          {items.length}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {open ? "Collapse" : "Expand"}
        </span>
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-2 overflow-hidden"
        >
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground italic pl-6">None found</p>
          ) : (
            items.map((item) => (
              <div key={item.id}>{renderItem(item)}</div>
            ))
          )}
        </motion.div>
      )}
    </div>
  );
}

function InsightsPanel({
  meetingId,
  providers,
  models,
}: {
  meetingId: string;
  providers: string[];
  models: ModelInfo[];
}) {
  const {
    decisions,
    actionItems,
    keyMoments,
    loading,
    extractInsights,
    reExtractInsights,
    toggleActionItem,
    updateActionItem,
  } = useInsights(meetingId);

  const [selectedProvider, setSelectedProvider] = useState(providers[0] ?? "");
  const [selectedModel, setSelectedModel] = useState("");
  const [extracting, setExtracting] = useState(false);

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
  const hasInsights = decisions.length > 0 || actionItems.length > 0 || keyMoments.length > 0;

  const handleExtract = async (reExtract: boolean) => {
    if (!selectedProvider || !selectedModel) return;
    setExtracting(true);
    try {
      if (reExtract) {
        await reExtractInsights(selectedProvider, selectedModel);
      } else {
        await extractInsights(selectedProvider, selectedModel);
      }
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading insights...</p>
      </div>
    );
  }

  if (!hasInsights) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <Lightbulb className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          No insights yet. Extract decisions, action items, and key moments from this meeting.
        </p>
        <div className="w-full max-w-xs space-y-2">
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
            size="sm"
            className="w-full"
            onClick={() => handleExtract(false)}
            disabled={extracting || !selectedProvider || !selectedModel}
          >
            {extracting ? "Extracting..." : "Extract Insights"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-6 p-4">
        <InsightSection
          title="Decisions"
          icon={Lightbulb}
          items={decisions}
          renderItem={(item) => (
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm leading-relaxed">{item.content}</p>
              {item.transcript_start_ms != null && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatMs(item.transcript_start_ms)}
                </span>
              )}
            </div>
          )}
        />

        <InsightSection
          title="Action Items"
          icon={ListChecks}
          items={actionItems}
          renderItem={(item) => (
            <ActionItemRow
              item={item}
              onToggle={toggleActionItem}
              onUpdate={updateActionItem}
            />
          )}
        />

        <InsightSection
          title="Key Moments"
          icon={Star}
          items={keyMoments}
          renderItem={(item) => (
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm leading-relaxed">{item.content}</p>
              {item.transcript_start_ms != null && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatMs(item.transcript_start_ms)}
                </span>
              )}
            </div>
          )}
        />

        {/* Re-extract */}
        <div className="border-t pt-4 space-y-2">
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
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleExtract(true)}
            disabled={extracting || !selectedProvider || !selectedModel}
          >
            <RotateCw className={`h-3 w-3 mr-1 ${extracting ? "animate-spin" : ""}`} />
            {extracting ? "Re-extracting..." : "Re-extract Insights"}
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

function CreateTicketButton({
  summaryId,
  existingTicket,
  teams,
  projects,
  defaultTeamId,
  defaultProjectId,
  providers,
  models,
  onFetchTeams,
  onTeamChange,
  onCreate,
}: {
  summaryId: string;
  existingTicket: LinearTicket | undefined;
  teams: LinearTeam[];
  projects: LinearProject[];
  defaultTeamId: string | null;
  defaultProjectId: string | null;
  providers: string[];
  models: ModelInfo[];
  onFetchTeams: () => void;
  onTeamChange: (teamId: string | null) => void;
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
          onTeamChange(teamId || defaultTeamId || null);
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
              onTeamChange(e.target.value || null);
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
  const [linearTeamId, setLinearTeamId] = useState<string | null>(null);
  const { projects: linearProjects } = useLinearProjects(linearTeamId);
  const [chatOpen, setChatOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
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
      setJustGenerated(true);
      setTimeout(() => setJustGenerated(false), 100);
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
            <ArrowLeft className="h-4 w-4" /> Back
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
          <MessageSquare className="h-4 w-4" /> Ask Nootle
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

        {/* Right column - Summaries & Insights */}
        <div className="flex w-96 flex-col">
          <Tabs defaultValue="summaries" className="flex flex-1 flex-col">
            <div className="px-4 py-2 border-b">
              <TabsList className="w-full">
                <TabsTrigger value="summaries" className="flex-1">Summaries</TabsTrigger>
                <TabsTrigger value="insights" className="flex-1">Insights</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="summaries" className="flex flex-1 flex-col mt-0">
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
                <div className="relative flex items-center justify-center">
                  <MotionButton
                    size="sm"
                    className="w-full"
                    onClick={handleGenerate}
                    disabled={generating || !selectedPrompt || !selectedProvider || !selectedModel}
                  >
                    {generating ? "Cooking..." : "Cook Up a Summary"}
                  </MotionButton>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <SparkleEffect trigger={justGenerated} />
                  </div>
                </div>
              </div>

              {/* Summary tabs */}
              <ScrollArea className="flex-1">
                {summaries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
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
                          <div className="mt-3 flex items-center gap-2">
                            <CreateTicketButton
                              summaryId={s.id}
                              existingTicket={tickets.find((t) => t.summary_id === s.id)}
                              teams={teams}
                              projects={linearProjects}
                              defaultTeamId={defaultTeamId}
                              defaultProjectId={defaultProjectId}
                              providers={providers}
                              models={models}
                              onFetchTeams={fetchTeams}
                              onTeamChange={setLinearTeamId}
                              onCreate={createTicket}
                            />
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="insights" className="flex flex-1 flex-col mt-0">
              <InsightsPanel meetingId={id!} providers={providers} models={models} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Audio player skeleton */}
      <div className="border-t px-8 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" disabled>
            <Play className="h-4 w-4" />
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
