import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { SparkleEffect } from "@/components/SparkleEffect";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/components/ChatPanel";
import { Markdown } from "@/components/Markdown";
import { NotesEditor } from "@/components/NotesEditor";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { useMeeting, updateMeetingTitle } from "@/hooks/useMeetings";
import { useTranscript } from "@/hooks/useTranscripts";
import { useSummaries } from "@/hooks/useSummaries";
import { useInsights } from "@/hooks/useInsights";
import { useTemplates } from "@/hooks/useTemplates";
import { useLLM } from "@/hooks/useLLM";
import { useLinearTickets, useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
import { formatMs, formatDate, statusLabel } from "@/lib/utils";
import { useLLMSelection } from "@/hooks/useLLMSelection";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useTags } from "@/hooks/useTags";
import { useScratchPad } from "@/hooks/useScratchPad";
import type { LinearTicket, LinearTeam, LinearProject, ModelInfo, InsightWithActionItem, Tag } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Input } from "@/components/ui/input";
import { TagEditor } from "@/components/TagEditor";
import { ArrowLeft, MessageSquare, FileText, Play, Pause, Check, RotateCw, Lightbulb, ListChecks, Star, Pencil, AlignJustify, List, StickyNote, Sparkles, PanelLeftClose, PanelLeftOpen, Copy, CheckCheck, Zap, AlertTriangle } from "lucide-react";
import { useWorkflows, useWorkflowRuns } from "@/hooks/useWorkflows";

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}


const speakerColors = [
  "text-blue-400",
  "text-green-400",
  "text-amber-400",
  "text-purple-400",
  "text-pink-400",
  "text-cyan-400",
];

function formatPlayerTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
    <div className="flex items-start gap-2 rounded-md border p-3 group/action">
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
        <div className="flex items-start gap-2">
          <p className={`text-sm leading-relaxed flex-1 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {item.content}
          </p>
          <CopyButton text={item.content} className="opacity-0 group-hover/action:opacity-100 shrink-0 mt-0.5" />
        </div>
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
    insights,
    insightTypes,
    groupedByType,
    loading,
    error: insightsError,
    extractInsights,
    reExtractInsights,
    toggleActionItem,
    updateActionItem,
  } = useInsights(meetingId);

  const { selectedProvider, selectedModel, setSelectedModel, changeProvider, filteredModels } = useLLMSelection(providers, models);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const hasInsights = insights.length > 0;

  const handleExtract = async (reExtract: boolean) => {
    if (!selectedProvider || !selectedModel) return;
    setExtracting(true);
    setExtractError(null);
    try {
      if (reExtract) {
        await reExtractInsights(selectedProvider, selectedModel);
      } else {
        await extractInsights(selectedProvider, selectedModel);
      }
    } catch (err) {
      setExtractError(String(err));
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

  const noProviders = providers.length === 0;

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    lightbulb: Lightbulb,
    "list-checks": ListChecks,
    star: Star,
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Toolbar — always visible at top */}
      <div className="flex items-center gap-2 border-b px-5 py-2 flex-wrap">
        <select
          value={selectedProvider}
          onChange={(e) => changeProvider(e.target.value)}
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        >
          <option value="">Provider</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        >
          <option value="">Model</option>
          {filteredModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => handleExtract(hasInsights)}
          disabled={extracting || !selectedProvider || !selectedModel}
        >
          {hasInsights ? (
            <>
              <RotateCw className={`h-3 w-3 mr-1 ${extracting ? "animate-spin" : ""}`} />
              {extracting ? "Re-extracting..." : "Re-extract"}
            </>
          ) : (
            <>
              <Lightbulb className={`h-3 w-3 mr-1 ${extracting ? "animate-pulse" : ""}`} />
              {extracting ? "Extracting..." : "Extract Insights"}
            </>
          )}
        </Button>
        {(extractError || insightsError) && (
          <span className="text-xs text-destructive">{extractError || insightsError}</span>
        )}
      </div>

      <ScrollArea className="flex-1">
        {!hasInsights ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              {noProviders
                ? "Add an LLM provider in Settings to extract insights."
                : "No insights yet. Select a provider and model above to extract them."}
            </p>
          </div>
        ) : (
          <div className="space-y-6 p-5">
            {insightTypes.map((t) => {
              const items = groupedByType[t.slug] ?? [];
              const Icon = iconMap[t.icon] ?? Lightbulb;
              return (
                <InsightSection
                  key={t.slug}
                  title={t.name + "s"}
                  icon={Icon}
                  items={items}
                  renderItem={(item) =>
                    t.has_action_fields ? (
                      <ActionItemRow
                        item={item}
                        onToggle={toggleActionItem}
                        onUpdate={updateActionItem}
                      />
                    ) : (
                      <div className="rounded-md border p-3 space-y-1 group/insight">
                        <div className="flex items-start gap-2">
                          <p className="text-sm leading-relaxed flex-1">{item.content}</p>
                          <CopyButton text={item.content} className="opacity-0 group-hover/insight:opacity-100 shrink-0 mt-0.5" />
                        </div>
                        {item.transcript_start_ms != null && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {formatMs(item.transcript_start_ms)}
                          </span>
                        )}
                      </div>
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
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
  const { selectedProvider, selectedModel, setSelectedModel, changeProvider, filteredModels } = useLLMSelection(providers, models);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTeamId && !teamId) setTeamId(defaultTeamId);
  }, [defaultTeamId, teamId]);

  useEffect(() => {
    if (defaultProjectId && !projectId) setProjectId(defaultProjectId);
  }, [defaultProjectId, projectId]);

  if (existingTicket) {
    const isHttps = existingTicket.linear_issue_url.startsWith("https://");
    return isHttps ? (
      <a
        href={existingTicket.linear_issue_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {existingTicket.linear_identifier}
      </a>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {existingTicket.linear_identifier}
      </span>
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
              onChange={(e) => changeProvider(e.target.value)}
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


function NotesPanel({
  meetingId,
  rawNotes,
  enrichedNotes,
  providers,
  models,
  onRefresh,
}: {
  meetingId: string;
  rawNotes: string | null;
  enrichedNotes: string | null;
  providers: string[];
  models: ModelInfo[];
  onRefresh: () => void;
}) {
  const { selectedProvider, selectedModel, setSelectedModel, changeProvider, filteredModels } = useLLMSelection(providers, models);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"original" | "enriched">("enriched");
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnrich = async () => {
    if (!selectedProvider || !selectedModel) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      await invoke("enrich_meeting_notes", {
        meetingId,
        provider: selectedProvider,
        model: selectedModel,
      });
      setViewMode("enriched");
      onRefresh();
    } catch (err) {
      setEnrichError(String(err));
    } finally {
      setEnriching(false);
    }
  };

  const handleNotesChange = useCallback((value: string) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      try {
        await invoke("save_enriched_notes", { id: meetingId, enrichedNotes: value });
      } catch {
      }
    }, 600);
  }, [meetingId]);

  if (!rawNotes) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
        <StickyNote className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          No notes for this meeting. Take notes during recording to see them here.
        </p>
      </div>
    );
  }

  const displayContent = enrichedNotes ?? rawNotes;
  const hasEnriched = !!enrichedNotes;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-5 py-2">
        {!hasEnriched && (
          <>
            <select
              value={selectedProvider}
              onChange={(e) => changeProvider(e.target.value)}
              className="h-7 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Provider</option>
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-7 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Model</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={handleEnrich}
              disabled={enriching || !selectedProvider || !selectedModel}
            >
              <Sparkles className={`h-3 w-3 mr-1 ${enriching ? "animate-pulse" : ""}`} />
              {enriching ? "Enriching..." : "Enrich with AI"}
            </Button>
            {enrichError && (
              <span className="text-xs text-destructive">{enrichError}</span>
            )}
          </>
        )}
        {hasEnriched && rawNotes && (
          <div className="flex rounded-md border text-xs overflow-hidden">
            <button
              onClick={() => setViewMode("original")}
              className={`px-3 py-1 transition-colors ${viewMode === "original" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Original
            </button>
            <button
              onClick={() => setViewMode("enriched")}
              className={`px-3 py-1 transition-colors ${viewMode === "enriched" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              AI Enhanced
            </button>
            </div>
          )}
          <CopyButton text={displayContent} className="ml-auto" />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="relative">
            {/* Enriched — always mounted so TipTap doesn't reinitialize */}
            <motion.div
              animate={{
                opacity: viewMode === "enriched" || !hasEnriched ? 1 : 0,
                filter: viewMode === "enriched" || !hasEnriched ? "blur(0px)" : "blur(4px)",
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={viewMode === "original" && hasEnriched ? "pointer-events-none" : ""}
            >
              <NotesEditor
                content={displayContent}
                hasHighlights={hasEnriched}
                onChange={handleNotesChange}
              />
            </motion.div>

            {/* Original — overlaid on top when active */}
            {hasEnriched && rawNotes && (
              <motion.div
                className="absolute inset-0"
                animate={{
                  opacity: viewMode === "original" ? 1 : 0,
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{ pointerEvents: viewMode === "original" ? "auto" : "none" }}
              >
                <Markdown content={rawNotes} />
              </motion.div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, loading: meetingLoading, refresh: refreshMeeting } = useMeeting(id!);
  const { segments, loading: transcriptLoading } = useTranscript(id!);
  const { summaries, generateSummary } = useSummaries(id!);
  const { templates } = useTemplates();
  const { models, providers } = useLLM();
  const { storedProviders: storedApiProviders } = useApiKeys();
  const { tags: allTags, getMeetingTags, addMeetingTag, removeMeetingTag, createTag } = useTags();
  const { notes: scratchNotes } = useScratchPad(id ?? null);
  const [meetingTags, setMeetingTags] = useState<Tag[]>([]);
  const hasLinear = storedApiProviders.includes("linear");
  const { tickets, createTicket } = useLinearTickets(id!);
  const { teams, fetchTeams } = useLinearTeams();
  const { defaultTeamId, defaultProjectId } = useLinearSettings();
  const [linearTeamId, setLinearTeamId] = useState<string | null>(null);
  const { projects: linearProjects } = useLinearProjects(linearTeamId);
  const { workflows, runWorkflow } = useWorkflows();
  const { runs, refresh: refreshRuns } = useWorkflowRuns(id);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const { selectedProvider, selectedModel, setSelectedModel, changeProvider, filteredModels } = useLLMSelection(providers, models);
  const [compactTranscript, setCompactTranscript] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true);

  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioRef = useCallback((node: HTMLAudioElement | null) => {
    setAudioElement(node);
  }, []);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (templates.length > 0 && !selectedTemplate) {
      setSelectedTemplate(templates[0].id);
    }
  }, [templates, selectedTemplate]);

  useEffect(() => {
    if (!id) return;
    getMeetingTags(id).then(setMeetingTags).catch(() => {});
  }, [id, getMeetingTags]);

  const handleAddMeetingTag = useCallback(async (meetingId: string, tagId: string) => {
    await addMeetingTag(meetingId, tagId);
    const updated = await getMeetingTags(meetingId);
    setMeetingTags(updated);
  }, [addMeetingTag, getMeetingTags]);

  const handleRemoveMeetingTag = useCallback(async (meetingId: string, tagId: string) => {
    await removeMeetingTag(meetingId, tagId);
    const updated = await getMeetingTags(meetingId);
    setMeetingTags(updated);
  }, [removeMeetingTag, getMeetingTags]);

  // Listen for auto-generated title updates from the backend
  useEffect(() => {
    const unlisten = listen("meeting-updated", () => {
      refreshMeeting();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refreshMeeting]);

  const handleTitleSave = useCallback(async () => {
    if (!meeting || !titleDraft.trim() || titleDraft.trim() === meeting.title) {
      setEditingTitle(false);
      return;
    }
    await updateMeetingTitle(meeting.id, titleDraft.trim());
    await refreshMeeting();
    setEditingTitle(false);
  }, [meeting, titleDraft, refreshMeeting]);

  // Load audio data
  useEffect(() => {
    if (!id || !meeting?.audio_path) return;
    setAudioLoading(true);
    invoke<string | null>("get_audio_data", { meetingId: id })
      .then((base64) => {
        if (base64) {
          setAudioSrc(`data:audio/wav;base64,${base64}`);
        }
      })
      .catch(() => {})
      .finally(() => setAudioLoading(false));
  }, [id, meeting?.audio_path]);

  // Audio time update
  useEffect(() => {
    const audio = audioElement;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioElement]);

  const togglePlayback = useCallback(async () => {
    const audio = audioElement;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  }, [isPlaying, audioElement]);

  const seekAudio = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioElement;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }, [duration, audioElement]);

  const seekToMs = useCallback(async (ms: number) => {
    const audio = audioElement;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    if (!isPlaying) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  }, [isPlaying, audioElement]);

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
    if (!selectedTemplate || !selectedProvider || !selectedModel) return;
    setGenerating(true);
    try {
      await generateSummary(selectedTemplate, selectedProvider, selectedModel);
      setJustGenerated(true);
      setTimeout(() => setJustGenerated(false), 100);
    } catch {
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
            {editingTitle ? (
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="text-xl font-bold h-auto py-0 border-none bg-transparent"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer group/title flex items-center gap-2 hover:text-muted-foreground transition-colors"
                onClick={() => {
                  setTitleDraft(meeting.title);
                  setEditingTitle(true);
                }}
              >
                {meeting.title}
                <Pencil className="h-3.5 w-3.5 opacity-0 group-hover/title:opacity-50 transition-opacity" />
              </h1>
            )}
            <p className="text-sm text-muted-foreground">
              {formatDate(meeting.start_time, "long")}
            </p>
            <TagEditor
              meetingId={meeting.id}
              meetingTags={meetingTags}
              allTags={allTags}
              onAddTag={handleAddMeetingTag}
              onRemoveTag={handleRemoveMeetingTag}
              onCreateTag={createTag}
            />
          </div>
          <Badge variant="outline">{statusLabel(meeting.status)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {workflows.filter(w => w.is_enabled).length > 0 && (
            <div className="flex items-center gap-2">
              {workflows.filter(w => w.is_enabled).map((w) => {
                const recentRun = runs.find(r => r.workflow_id === w.id);
                const isRunning = recentRun?.status === "running" || recentRun?.status === "pending";
                const succeeded = recentRun?.status === "completed";
                const failed = recentRun?.status === "failed";

                return (
                  <Button
                    key={w.id}
                    variant="outline"
                    size="sm"
                    disabled={isRunning}
                    onClick={async () => {
                      try {
                        await runWorkflow(id!, w.id);
                      } catch (err) {
                        console.error("Workflow failed:", err);
                      }
                      await refreshRuns();
                    }}
                    className="text-xs gap-1.5"
                    title={w.description || w.name}
                  >
                    {isRunning ? (
                      <RotateCw className="h-3 w-3 animate-spin" />
                    ) : succeeded ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : failed ? (
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    {w.name}
                  </Button>
                );
              })}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
            <MessageSquare className="h-4 w-4" /> Ask Nootle
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Transcript - collapsible left column */}
        {!transcriptCollapsed && (
          <div className="flex w-1/2 max-w-[50%] flex-col border-r">
            <div className="flex items-center justify-between px-8 border-b h-12">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Transcript
              </h2>
              <div className="flex items-center gap-1">
                <CopyButton
                  text={segments.map((s) => `${s.speaker_label}: ${s.text}`).join("\n")}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCompactTranscript((v) => !v)}
                  title={compactTranscript ? "Spacious view" : "Compact view"}
                >
                  {compactTranscript ? <AlignJustify className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className={`px-8 py-4 ${compactTranscript ? "space-y-1" : "space-y-4"}`}>
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
                    <div key={seg.id} className={`group flex gap-3 ${compactTranscript ? "items-baseline" : ""}`}>
                      <button
                        onClick={() => seekToMs(seg.start_ms)}
                        className="shrink-0 pt-0.5 text-xs text-muted-foreground font-mono tabular-nums w-12 text-left hover:text-primary transition-colors"
                      >
                        {formatMs(seg.start_ms)}
                      </button>
                      <p className="min-w-0 text-sm text-foreground leading-relaxed">
                        <span
                          className={`font-semibold ${speakerMap.get(seg.speaker_label) ?? "text-foreground"} mr-1.5`}
                        >
                          {seg.speaker_label}:
                        </span>
                        {seg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Right column - Summaries, Insights & Notes */}
        <div className={`flex flex-col min-w-0 ${transcriptCollapsed ? "flex-1" : "w-96"}`}>
          <Tabs defaultValue="notes" className="flex flex-1 flex-col">
            <div className="px-4 border-b flex items-center h-12 gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTranscriptCollapsed((v) => !v)}
                title={transcriptCollapsed ? "Show transcript" : "Hide transcript"}
              >
                {transcriptCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              <TabsList>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="summaries">Summaries</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
                {scratchNotes.length > 0 && <TabsTrigger value="highlights">Highlights</TabsTrigger>}
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="workflows">Workflows</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="notes" className="flex flex-1 flex-col mt-0">
              <NotesPanel
                meetingId={id!}
                rawNotes={meeting.raw_notes}
                enrichedNotes={meeting.enriched_notes}
                providers={providers}
                models={models}
                onRefresh={refreshMeeting}
              />
            </TabsContent>
            {scratchNotes.length > 0 && (
              <TabsContent value="highlights" className="flex flex-1 flex-col mt-0">
                <ScrollArea className="flex-1">
                  <div className="p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                      <StickyNote className="h-4 w-4 text-amber-500" />
                      Your Highlights
                    </h3>
                    {scratchNotes.map((note) => {
                      const totalSec = Math.floor(note.timestamp_ms / 1000);
                      const minutes = String(Math.floor(totalSec / 60)).padStart(2, "0");
                      const seconds = String(totalSec % 60).padStart(2, "0");
                      return (
                        <div
                          key={note.id}
                          className="rounded-lg bg-amber-500/5 border border-amber-500/10 px-4 py-3 flex items-start gap-3"
                        >
                          <span className="font-mono text-xs text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
                            {minutes}:{seconds}
                          </span>
                          <span className="text-sm text-foreground leading-relaxed">{note.content}</span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            )}
            <TabsContent value="summaries" className="flex flex-1 flex-col mt-0">
              {/* Compact generate toolbar */}
              <div className="flex items-center gap-2 border-b px-5 py-2 flex-wrap">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="h-7 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="">Template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select
                  value={selectedProvider}
                  onChange={(e) => changeProvider(e.target.value)}
                  className="h-7 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="">Provider</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-7 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="">Model</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <div className="relative">
                  <MotionButton
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleGenerate}
                    disabled={generating || !selectedTemplate || !selectedProvider || !selectedModel}
                  >
                    <Sparkles className={`h-3 w-3 mr-1 ${generating ? "animate-pulse" : ""}`} />
                    {generating ? "Generating..." : "Generate"}
                  </MotionButton>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <SparkleEffect trigger={justGenerated} />
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1">
                {summaries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground text-center">
                      No summaries yet. Select a prompt and generate one.
                    </p>
                  </div>
                ) : (
                  <div className="p-5 space-y-6">
                    {summaries.map((s) => {
                      const tmpl = s.template_id
                        ? templates.find((t) => t.id === s.template_id)
                        : null;
                      return (
                        <div key={s.id}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-medium text-foreground">
                              {tmpl?.name ?? "Summary"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {s.provider}/{s.model}
                            </span>
                            <CopyButton text={s.content} className="ml-auto" />
                          </div>
                          <Markdown content={s.content} />
                          {hasLinear && (
                            <div className="mt-3">
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
                          )}
                          {summaries.indexOf(s) < summaries.length - 1 && (
                            <hr className="mt-6 border-border" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="insights" className="flex flex-1 flex-col mt-0">
              <InsightsPanel meetingId={id!} providers={providers} models={models} />
            </TabsContent>
            <TabsContent value="analytics" className="flex flex-1 flex-col mt-0">
              <AnalyticsPanel meetingId={id!} providers={providers} models={models} />
            </TabsContent>
            <TabsContent value="workflows" className="flex flex-1 flex-col mt-0">
              <ScrollArea className="flex-1">
                <div className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4" />
                    Workflow Runs
                  </h3>
                  {runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No workflow runs yet. Configure workflows in Settings and run them from the header buttons.
                    </p>
                  ) : (
                    runs.map((run) => (
                      <div key={run.id} className="rounded-lg border px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{run.workflow_name ?? "Workflow"}</span>
                          <Badge variant={
                            run.status === "completed" ? "secondary" :
                            run.status === "failed" ? "destructive" :
                            "outline"
                          }>
                            {run.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(run.started_at).toLocaleString()}
                        </p>
                        {run.error && (
                          <p className="text-xs text-destructive">{run.error}</p>
                        )}
                        {run.result_json && run.status === "completed" && (() => {
                          try {
                            const result = JSON.parse(run.result_json);
                            return (
                              <p className="text-xs text-muted-foreground">{result.message}</p>
                            );
                          } catch { return null; }
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Audio player */}
      <div className="border-t px-8 py-3">
        {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!audioSrc || audioLoading}
            onClick={togglePlayback}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <div
            className="flex-1 cursor-pointer"
            onClick={audioSrc ? seekAudio : undefined}
          >
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all duration-150"
                style={{
                  width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
          </span>
        </div>
        {!audioSrc && !audioLoading && meeting?.audio_path && (
          <p className="text-xs text-muted-foreground mt-1">Audio file not found</p>
        )}
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
