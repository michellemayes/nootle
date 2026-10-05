import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { ChatPanel } from "@/components/ChatPanel";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState } from "@/components/EmptyState";
import { ActionItemCheckbox } from "@/components/ActionItemCheckbox";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { insightIcon } from "@/lib/insightIcons";
import { Collapsible } from "@/components/Collapsible";
import { Markdown } from "@/components/Markdown";
import { NotesEditor } from "@/components/NotesEditor";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { useMeeting, updateMeetingTitle } from "@/hooks/useMeetings";
import { useTranscript } from "@/hooks/useTranscripts";
import { useSummaries } from "@/hooks/useSummaries";
import { useInsights } from "@/hooks/useInsights";
import { useTemplates } from "@/hooks/useTemplates";
import { useLinearTickets, useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
import { cn, formatMs, formatDate, statusLabel, statusVariant } from "@/lib/utils";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useLabels } from "@/hooks/useLabels";
import { useScratchPad } from "@/hooks/useScratchPad";
import type { LinearTicket, LinearTeam, LinearProject, InsightWithActionItem, Label, SegmentEditResult, TranscriptSegment } from "@/types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabelEditor } from "@/components/LabelEditor";
import {
  AlertTriangle,
  AlignJustify,
  ArrowLeft,
  BarChart3,
  BookA,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Lightbulb,
  List,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Sparkles,
  StickyNote,
  X,
  Zap,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCompactMode } from "@/contexts/CompactModeContext";
import { useWorkflows, useWorkflowRuns } from "@/hooks/useWorkflows";

function parseResultMessage(json: string | null): string | null {
  if (!json) return null;
  try {
    return (JSON.parse(json) as { message?: string }).message ?? null;
  } catch {
    return null;
  }
}

function parseResultOutput(json: string | null): string | null {
  if (!json) return null;
  try {
    return (JSON.parse(json) as { output?: string }).output ?? null;
  } catch {
    return null;
  }
}

/**
 * Email drafts are formatted as `Subject: <line>\n\n<body>` by execute_email
 * in workflows.rs. Returns null if the output isn't an email draft.
 */
function parseEmailDraft(output: string | null): { subject: string; body: string } | null {
  if (!output) return null;
  const match = output.match(/^Subject: (.*?)\n\n([\s\S]*)$/);
  if (!match) return null;
  return { subject: match[1], body: match[2] };
}

const speakerColors = [
  "text-chart-1",
  "text-chart-2",
  "text-chart-3",
  "text-chart-4",
  "text-chart-5",
  "text-chart-6",
];

function pluralLines(n: number): string {
  return `${n} line${n === 1 ? "" : "s"}`;
}

/**
 * One transcript line. Double-click to edit; the draft lives here so typing
 * doesn't re-render the whole meeting page.
 */
function SegmentText({
  seg,
  speakerClass,
  onSave,
}: {
  seg: TranscriptSegment;
  speakerClass: string;
  onSave: (seg: TranscriptSegment, text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Closing the editor can fire blur as the textarea unmounts; finish once.
  const closedRef = useRef(false);

  if (draft === null) {
    return (
      <p
        className="min-w-0 flex-1 text-sm text-foreground leading-relaxed cursor-text"
        onDoubleClick={() => {
          closedRef.current = false;
          setDraft(seg.text);
        }}
        title="Double-click to fix a word"
      >
        <span className={`font-semibold ${speakerClass} mr-1.5`}>{seg.speaker_label}:</span>
        {seg.text}
      </p>
    );
  }

  const close = (save: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    const text = draft.trim();
    setDraft(null);
    if (save && text && text !== seg.text) onSave(seg, text);
  };

  return (
    <Textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          close(true);
        } else if (e.key === "Escape") {
          close(false);
        }
      }}
      className="min-h-0 flex-1 text-sm leading-relaxed"
      aria-label="Edit transcript line"
    />
  );
}

function formatPlayerTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  return formatMs(seconds * 1000);
}

/**
 * Progress bar and clock. Owns the playback position so `timeupdate`
 * (several times a second) re-renders only this, not the meeting page.
 */
function PlayerProgress({
  audio,
  showBar,
}: {
  audio: HTMLAudioElement | null;
  showBar: boolean;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
    };
  }, [audio]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  return (
    <>
      {showBar && (
        <div className="flex-1 cursor-pointer" onClick={seek}>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-[width] duration-150"
              style={{
                width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      )}
      <span className="text-xs font-mono text-muted-foreground tabular-nums">
        {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
      </span>
    </>
  );
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

  // Sync local edit state with the item when it refreshes (e.g. after a
  // re-extract) — otherwise we'd keep showing stale values.
  useEffect(() => {
    if (!editingAssignee) setAssignee(item.assignee ?? "");
  }, [item.assignee, editingAssignee]);
  useEffect(() => {
    if (!editingDueDate) setDueDate(item.due_date ?? "");
  }, [item.due_date, editingDueDate]);

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
      <ActionItemCheckbox
        done={isDone}
        label={item.content}
        onToggle={() => {
          if (item.action_item_id) onToggle(item.action_item_id, item.status ?? "open");
        }}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <p className={`text-sm leading-relaxed flex-1 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {item.content}
          </p>
          <CopyButton text={item.content} className="opacity-0 group-hover/action:opacity-100 shrink-0 mt-0.5" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={isDone ? "secondary" : "outline"} size="sm">
            {isDone ? "Done" : "Open"}
          </Badge>
          {editingAssignee ? (
            <Input
              autoFocus
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={handleAssigneeSave}
              onKeyDown={(e) => e.key === "Enter" && handleAssigneeSave()}
              placeholder="Assignee"
              aria-label="Assignee"
              className="h-6 w-28 px-1.5 text-xs"
            />
          ) : (
            <button
              onClick={() => setEditingAssignee(true)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.assignee || "Assign"}
            </button>
          )}
          {editingDueDate ? (
            <Input
              autoFocus
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onBlur={handleDueDateSave}
              aria-label="Due date"
              className="h-6 w-auto px-1.5 text-xs"
            />
          ) : (
            <button
              onClick={() => setEditingDueDate(true)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.due_date || "Due date"}
            </button>
          )}
          {item.transcript_start_ms != null && (
            <span className="font-mono text-muted-foreground">
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
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" size="sm">
          {items.length}
        </Badge>
      </button>
      <Collapsible open={open}>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="pl-6 text-xs text-muted-foreground">None found in this meeting.</p>
          ) : (
            items.map((item) => (
              <div key={item.id}>{renderItem(item)}</div>
            ))
          )}
        </div>
      </Collapsible>
    </div>
  );
}

function InsightsPanel({
  meetingId,
}: {
  meetingId: string;
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

  const { selectedProvider, selectedModel, providers } = useGlobalLLMSelection();
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
    return <LoadingState message={LOADING_COPY.insights} />;
  }

  const noProviders = providers.length === 0;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b px-5 py-2 flex-wrap">
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
              {extracting ? "Re-extracting…" : "Re-extract"}
            </>
          ) : (
            <>
              <Lightbulb className={`h-3 w-3 mr-1 ${extracting ? "animate-pulse" : ""}`} />
              {extracting ? "Extracting…" : "Extract insights"}
            </>
          )}
        </Button>
        {(extractError || insightsError) && (
          <span className="text-xs text-destructive">Couldn't extract insights. Try again.</span>
        )}
      </div>

      <ScrollArea className="flex-1">
        {!hasInsights ? (
          <EmptyState
            icon={Lightbulb}
            size="panel"
            description={
              noProviders
                ? "Add an AI provider in Settings to extract insights."
                : "No insights yet. Choose a model in the sidebar, then extract insights."
            }
          />
        ) : (
          <div className="space-y-6 p-5">
            {insightTypes.map((t) => {
              const items = groupedByType[t.slug] ?? [];
              const Icon = insightIcon(t.icon);
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
                          <span className="font-mono text-xs text-muted-foreground">
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
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
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
        Create ticket
      </Button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border p-3">
          <Select
            size="sm"
            containerClassName="w-full"
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setProjectId("");
              onTeamChange(e.target.value || null);
            }}
            aria-label="Linear team"
          >
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.key})
              </option>
            ))}
          </Select>
          <Select
            size="sm"
            containerClassName="w-full"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!teamId}
            aria-label="Linear project"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !teamId || !selectedProvider || !selectedModel}
            >
              {creating ? "Creating…" : "Create"}
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
  scratchNotes,
  onRefresh,
}: {
  meetingId: string;
  rawNotes: string | null;
  enrichedNotes: string | null;
  scratchNotes: { id: string; content: string; timestamp_ms: number }[];
  onRefresh: () => void;
}) {
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
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

  const renderQuickNotes = () => {
    if (scratchNotes.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-3.5 w-3.5 text-highlight" />
          <h3 className="text-sm font-semibold">Quick notes</h3>
        </div>
        <div className="space-y-1.5">
          {scratchNotes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-3 rounded-lg border border-highlight/20 bg-highlight/5 px-3 py-2"
            >
              <span className="mt-0.5 shrink-0 font-mono text-xs text-highlight-foreground">
                {formatMs(note.timestamp_ms)}
              </span>
              <span className="text-sm leading-relaxed text-foreground">{note.content}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!rawNotes) {
    if (scratchNotes.length > 0) {
      return (
        <ScrollArea className="flex-1">
          <div className="p-5">{renderQuickNotes()}</div>
        </ScrollArea>
      );
    }
    return (
      <EmptyState
        icon={StickyNote}
        size="panel"
        description="No notes for this meeting. Take notes during recording to see them here."
      />
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={handleEnrich}
              disabled={enriching || !selectedProvider || !selectedModel}
            >
              <Sparkles className={`h-3 w-3 mr-1 ${enriching ? "animate-pulse" : ""}`} />
              {enriching ? "Enriching…" : "Enrich with AI"}
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
              aria-pressed={viewMode === "original"}
              className={`px-3 py-1 transition-colors ${viewMode === "original" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Original
            </button>
            <button
              onClick={() => setViewMode("enriched")}
              aria-pressed={viewMode === "enriched"}
              className={`px-3 py-1 transition-colors ${viewMode === "enriched" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Enriched
            </button>
          </div>
        )}
        <CopyButton text={displayContent} className="ml-auto" />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {renderQuickNotes()}
          <div className="relative">
            {/* Enriched — always mounted so TipTap doesn't reinitialize */}
            <div
              className={cn(
                "transition-opacity duration-200",
                viewMode === "original" && hasEnriched && "pointer-events-none opacity-0",
              )}
            >
              <NotesEditor
                content={displayContent}
                hasHighlights={hasEnriched}
                onChange={handleNotesChange}
              />
            </div>

            {/* Original — overlaid on top when active */}
            {hasEnriched && rawNotes && (
              <div
                className={cn(
                  "absolute inset-0 transition-opacity duration-200",
                  viewMode === "original" ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <Markdown content={rawNotes} />
              </div>
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
  const { segments, loading: transcriptLoading, refresh: refreshTranscript } = useTranscript(id!);
  const [dictionaryNotice, setDictionaryNotice] = useState<string | null>(null);

  const saveSegmentEdit = async (seg: TranscriptSegment, text: string) => {
    try {
      const result = await invoke<SegmentEditResult>("update_transcript_segment", {
        segmentId: seg.id,
        text,
      });
      if (result.learned.length > 0) {
        const pairs = result.learned.map((c) => `“${c.from}” → “${c.to}”`).join(", ");
        const more = result.corrected_segments;
        setDictionaryNotice(
          `Learned ${pairs}` + (more > 0 ? ` and fixed ${pluralLines(more)} more` : ""),
        );
      }
      await refreshTranscript();
    } catch (err) {
      setDictionaryNotice(`Couldn't save edit: ${err}`);
    }
  };

  const applyDictionary = async () => {
    try {
      const changed = await invoke<number>("apply_dictionary_to_meeting", { meetingId: id });
      setDictionaryNotice(
        changed > 0
          ? `Dictionary fixed ${pluralLines(changed)}`
          : "Nothing to fix — transcript already matches your dictionary",
      );
      if (changed > 0) await refreshTranscript();
    } catch (err) {
      setDictionaryNotice(`Couldn't apply dictionary: ${err}`);
    }
  };
  const { summaries, loading: summariesLoading, generateSummary } = useSummaries(id!);
  const { templates } = useTemplates();
  const { storedProviders: storedApiProviders } = useApiKeys();
  const { labels: allLabels, getMeetingLabels, addMeetingLabel, removeMeetingLabel, createLabel } = useLabels();
  const { notes: scratchNotes } = useScratchPad(id ?? null);
  const [meetingLabels, setMeetingLabels] = useState<Label[]>([]);
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
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const { isCompact } = useCompactMode();
  const [compactTranscript, setCompactTranscript] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true);
  const [transcriptWidth, setTranscriptWidth] = useState(50);
  const resizingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCompact) setTranscriptCollapsed(true);
  }, [isCompact]);

  useEffect(() => {
    const preventSelect = (e: Event) => {
      if (resizingRef.current) e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setTranscriptWidth(Math.min(70, Math.max(20, pct)));
    };
    const onMouseUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("selectstart", preventSelect);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("selectstart", preventSelect);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioRef = useCallback((node: HTMLAudioElement | null) => {
    setAudioElement(node);
  }, []);
  const [failedAudioSrc, setFailedAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (templates.length > 0 && !selectedTemplate) {
      setSelectedTemplate(templates[0].id);
    }
  }, [templates, selectedTemplate]);

  useEffect(() => {
    if (!id) return;
    getMeetingLabels(id).then(setMeetingLabels).catch(() => {});
  }, [id, getMeetingLabels]);

  const handleAddMeetingLabel = useCallback(async (meetingId: string, labelId: string) => {
    await addMeetingLabel(meetingId, labelId);
    const updated = await getMeetingLabels(meetingId);
    setMeetingLabels(updated);
  }, [addMeetingLabel, getMeetingLabels]);

  const handleRemoveMeetingLabel = useCallback(async (meetingId: string, labelId: string) => {
    await removeMeetingLabel(meetingId, labelId);
    const updated = await getMeetingLabels(meetingId);
    setMeetingLabels(updated);
  }, [removeMeetingLabel, getMeetingLabels]);

  const handleTitleSave = useCallback(async () => {
    if (!meeting || !titleDraft.trim() || titleDraft.trim() === meeting.title) {
      setEditingTitle(false);
      return;
    }
    await updateMeetingTitle(meeting.id, titleDraft.trim());
    await refreshMeeting();
    setEditingTitle(false);
  }, [meeting, titleDraft, refreshMeeting]);

  // Stream the recording straight from disk; the webview fetches ranges on
  // demand instead of the whole WAV crossing IPC as base64.
  const audioSrc = meeting?.audio_path ? convertFileSrc(meeting.audio_path) : null;
  const audioMissing = audioSrc !== null && failedAudioSrc === audioSrc;

  useEffect(() => {
    const audio = audioElement;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    const onError = () => setFailedAudioSrc(audio.src);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
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
    setGenerateError(null);
    try {
      await generateSummary(selectedTemplate, selectedProvider, selectedModel);
    } catch (err) {
      setGenerateError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  // A finished meeting should open with a summary already there. The backend
  // summarizes on stop; this covers meetings it skipped (older recordings,
  // a provider added later), once per meeting visit.
  const autoGeneratedForRef = useRef<string | null>(null);
  // While the backend is still processing, its own summary arrives with the
  // status change, so mark this visit handled rather than race it.
  const processing = meeting?.status === "transcribing";
  if (processing && id) autoGeneratedForRef.current = id;
  useEffect(() => {
    if (
      !id ||
      autoGeneratedForRef.current === id ||
      meeting?.status !== "summarized" ||
      summariesLoading ||
      summaries.length > 0 ||
      transcriptLoading ||
      segments.length === 0 ||
      generating ||
      !selectedTemplate ||
      !selectedProvider ||
      !selectedModel
    ) {
      return;
    }
    autoGeneratedForRef.current = id;
    handleGenerate();
  }, [id, meeting?.status, summariesLoading, summaries.length, transcriptLoading, segments.length, generating, selectedTemplate, selectedProvider, selectedModel]);

  if (meetingLoading) {
    return <LoadingState message={LOADING_COPY.meeting} />;
  }

  if (!meeting) {
    return (
      <EmptyState
        icon={FileText}
        title="Meeting not found"
        description="It may have been deleted."
        action={
          <Button variant="outline" onClick={() => navigate("/")}>
            Back to meetings
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
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
              <Badge variant={statusVariant(meeting.status)} size="sm">
                {statusLabel(meeting.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(meeting.start_time, "long")}
            </p>
            {!isCompact && (
            <div className="mt-1.5">
            <LabelEditor
              meetingId={meeting.id}
              meetingLabels={meetingLabels}
              allLabels={allLabels}
              onAddLabel={handleAddMeetingLabel}
              onRemoveLabel={handleRemoveMeetingLabel}
              onCreateLabel={(name, color) => createLabel(name, color, null)}
            />
            </div>
            )}
          </div>
        </div>
        {!isCompact && (
        <div className="flex items-center gap-2">
          {(() => {
            const enabledWorkflows = workflows.filter((w) => w.is_enabled);
            if (enabledWorkflows.length === 0) return null;
            const anyRunning = enabledWorkflows.some((w) => {
              const recentRun = runs.find((r) => r.workflow_id === w.id);
              return recentRun?.status === "running" || recentRun?.status === "pending";
            });
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    {anyRunning ? (
                      <RotateCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Run
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-1.5">
                  <div className="space-y-0.5">
                    {enabledWorkflows.map((w) => {
                      const recentRun = runs.find((r) => r.workflow_id === w.id);
                      const isRunning =
                        recentRun?.status === "running" || recentRun?.status === "pending";
                      const succeeded = recentRun?.status === "completed";
                      const failed = recentRun?.status === "failed";
                      return (
                        <button
                          key={w.id}
                          type="button"
                          disabled={isRunning}
                          onClick={async () => {
                            try {
                              await runWorkflow(id!, w.id, {
                                provider: selectedProvider ?? undefined,
                                model: selectedModel ?? undefined,
                              });
                            } catch (err) {
                              console.error("Workflow failed:", err);
                            }
                            await refreshRuns();
                          }}
                          className="w-full text-left rounded-md px-2.5 py-2 text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-start gap-2"
                          title={w.description || w.name}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">
                            {isRunning ? (
                              <RotateCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : succeeded ? (
                              <Check className="h-3.5 w-3.5 text-success-foreground" />
                            ) : failed ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            ) : w.icon ? (
                              <span>{w.icon}</span>
                            ) : (
                              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium leading-tight">{w.name}</span>
                            {w.description && (
                              <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {w.description}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })()}
          {!chatOpen && (
            <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
              <MessageSquare className="h-4 w-4" /> Ask Nootle
            </Button>
          )}
        </div>
        )}
      </div>

      {/* Two-column layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
          {!transcriptCollapsed && (
            <div
              className="flex overflow-hidden"
              style={{ width: `${transcriptWidth}%` }}
            >
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 border-b h-12">
                  <h2 className="text-sm font-semibold">Transcript</h2>
                  <div className="flex items-center gap-1">
                    <CopyButton
                      text={segments.map((s) => `${s.speaker_label}: ${s.text}`).join("\n")}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={applyDictionary}
                      disabled={segments.length === 0}
                      title="Apply dictionary"
                      aria-label="Apply dictionary"
                    >
                      <BookA className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCompactTranscript((v) => !v)}
                      title={compactTranscript ? "Spacious view" : "Compact view"}
                      aria-label={compactTranscript ? "Spacious view" : "Compact view"}
                    >
                      {compactTranscript ? <AlignJustify className="h-4 w-4" /> : <List className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {dictionaryNotice && (
                  <div className="flex items-center gap-2 border-b bg-muted/50 px-5 py-2 text-xs text-muted-foreground">
                    <BookA className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{dictionaryNotice}</span>
                    <Link to="/settings?tab=dictionary" className="shrink-0 hover:text-foreground underline-offset-2 hover:underline">
                      Dictionary
                    </Link>
                    <button
                      onClick={() => setDictionaryNotice(null)}
                      className="shrink-0 hover:text-foreground"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <ScrollArea className="flex-1">
                  <div className={`p-5 ${compactTranscript ? "space-y-1" : "space-y-4"}`}>
                    {transcriptLoading ? (
                      <LoadingState
                        message={LOADING_COPY.transcript}
                        layout="inline"
                      />
                    ) : segments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No transcript for this meeting.
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
                          <SegmentText
                            seg={seg}
                            speakerClass={speakerMap.get(seg.speaker_label) ?? "text-foreground"}
                            onSave={saveSegmentEdit}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
              <div
                className="w-1.5 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors border-r"
                onMouseDown={() => {
                  resizingRef.current = true;
                  document.body.style.cursor = "col-resize";
                  document.body.style.userSelect = "none";
                }}
              />
            </div>
          )}

        <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
          <Tabs defaultValue="summaries" className="flex flex-1 flex-col overflow-hidden">
            <div className="px-4 border-b flex items-center h-12 gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTranscriptCollapsed((v) => !v)}
                title={transcriptCollapsed ? "Show transcript" : "Hide transcript"}
                aria-label={transcriptCollapsed ? "Show transcript" : "Hide transcript"}
              >
                {transcriptCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              <TabsList>
                <TabsTrigger value="summaries" title="Summaries">
                  {isCompact ? <Sparkles className="h-4 w-4" /> : "Summaries"}
                </TabsTrigger>
                <TabsTrigger value="notes" title="Notes">
                  {isCompact ? <FileText className="h-4 w-4" /> : "Notes"}
                </TabsTrigger>
                <TabsTrigger value="insights" title="Insights">
                  {isCompact ? <Lightbulb className="h-4 w-4" /> : "Insights"}
                </TabsTrigger>
                <TabsTrigger value="analytics" title="Analytics">
                  {isCompact ? <BarChart3 className="h-4 w-4" /> : "Analytics"}
                </TabsTrigger>
                <TabsTrigger value="workflows" title="Workflows">
                  {isCompact ? <Zap className="h-4 w-4" /> : "Workflows"}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="notes" className="flex flex-1 flex-col mt-0">
              <NotesPanel
                meetingId={id!}
                rawNotes={meeting.raw_notes}
                enrichedNotes={meeting.enriched_notes}
                scratchNotes={scratchNotes}
                onRefresh={refreshMeeting}
              />
            </TabsContent>
            <TabsContent value="summaries" className="flex flex-1 flex-col mt-0">
              <div className="flex items-center gap-2 border-b px-5 py-2 flex-wrap">
                <Select
                  size="xs"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  aria-label="Summary template"
                >
                  <option value="">Template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={handleGenerate}
                  disabled={generating || !selectedTemplate || !selectedProvider || !selectedModel}
                >
                  <Sparkles className={`h-3 w-3 mr-1 ${generating ? "animate-pulse" : ""}`} />
                  {generating ? "Generating…" : "Generate summary"}
                </Button>
              </div>

              {generateError && (
                <div className="flex items-center gap-2 border-b px-5 py-2 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {generateError}
                </div>
              )}

              <ScrollArea className="flex-1">
                {summaries.length === 0 ? (
                  <EmptyState
                    icon={generating || processing ? Sparkles : FileText}
                    size="panel"
                    description={
                      generating || processing
                        ? "Generating summary…"
                        : "No summaries yet. Pick a template above and generate one."
                    }
                  />
                ) : (
                  <div className="p-5 space-y-6">
                    {summaries.map((s, index) => {
                      const tmpl = s.template_id
                        ? templates.find((t) => t.id === s.template_id)
                        : null;
                      return (
                        <div key={s.id}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-medium text-foreground">
                              {tmpl?.name ?? "Summary"}
                            </span>
                            <span className="text-xs text-muted-foreground">
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
                                onFetchTeams={fetchTeams}
                                onTeamChange={setLinearTeamId}
                                onCreate={createTicket}
                              />
                            </div>
                          )}
                          {index < summaries.length - 1 && (
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
              <InsightsPanel meetingId={id!} />
            </TabsContent>
            <TabsContent value="analytics" className="flex flex-1 flex-col mt-0">
              <AnalyticsPanel meetingId={id!} />
            </TabsContent>
            <TabsContent value="workflows" className="flex flex-1 flex-col mt-0">
              <ScrollArea className="flex-1">
                <div className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4" />
                    Workflow runs
                  </h3>
                  {runs.length === 0 ? (
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>No workflow runs yet.</p>
                      <p>
                        Set up workflows under{" "}
                        <Link to="/templates" className="text-primary underline-offset-2 hover:underline">
                          Automations &rarr; Workflows
                        </Link>{" "}
                        and turn them on. Enabled workflows appear in the{" "}
                        <span className="font-medium">Run</span> menu at the top
                        of this page.
                      </p>
                    </div>
                  ) : (
                    runs.map((run) => {
                      const output = parseResultOutput(run.result_json);
                      const emailDraft = parseEmailDraft(output);
                      const message = parseResultMessage(run.result_json);
                      return (
                        <div key={run.id} className="rounded-lg border px-4 py-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{run.workflow_name ?? "Workflow"}</span>
                            <Badge variant={statusVariant(run.status)} size="sm">
                              {statusLabel(run.status)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.started_at).toLocaleString()}
                          </p>
                          {run.error && (
                            <p className="text-xs text-destructive">{run.error}</p>
                          )}
                          {run.status === "completed" && message && (
                            <p className="text-xs text-muted-foreground">{message}</p>
                          )}
                          {run.status === "completed" && output && (
                            <div className="mt-2 space-y-2">
                              {emailDraft && (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={async () => {
                                      const url = `mailto:?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
                                      const { openUrl } = await import("@tauri-apps/plugin-opener");
                                      await openUrl(url);
                                    }}
                                  >
                                    Open in Mail
                                  </Button>
                                  <CopyButton variant="button" text={output} label="Copy output" />
                                </div>
                              )}
                              {!emailDraft && (
                                <CopyButton variant="button" text={output} label="Copy output" />
                              )}
                              <pre className="rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                                {output}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Audio player */}
      <div className="shrink-0 border-t px-5 py-3">
        {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!audioSrc || audioMissing}
            onClick={togglePlayback}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <PlayerProgress audio={audioElement} showBar={!isCompact} />
        </div>
        {audioMissing && (
          <p className="text-xs text-muted-foreground mt-1">Audio file not found</p>
        )}
      </div>
    </div>
      <ChatPanel
        meetingId={id!}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
