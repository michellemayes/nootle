import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusVariant, labelTextColor, isTypingTarget } from "@/lib/utils";
import { formatMinutes, groupByDay, relativeWhen } from "@/lib/momentum";
import { MomentumStrip } from "@/components/MomentumStrip";
import { UpcomingMeetings } from "@/components/UpcomingMeetings";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Kbd } from "@/components/Kbd";
import { useCompactMode } from "@/contexts/CompactModeContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import {
  useMeetings,
  deleteMeeting,
  archiveMeeting,
  unarchiveMeeting,
} from "@/hooks/useMeetings";
import { useLabels } from "@/hooks/useLabels";
import { usePinnedMeetings } from "@/hooks/usePinnedMeetings";
import { MeetingActionMenuItems } from "@/components/MeetingActionMenuItems";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LabelEditor } from "@/components/LabelEditor";
import { toast } from "@/components/Toaster";
import type { Meeting } from "@/types";
import {
  Search,
  Mic,
  MoreVertical,
  Pin,
  LayoutGrid,
  List,
  Archive,
  Circle,
  Upload,
  X,
} from "lucide-react";

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress";
  return formatMinutes(Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

/** "Done" is the normal end state, so only call out meetings that aren't. */
const showStatus = (status: string) => status !== "summarized";

const dropdownPrimitives = {
  MenuItem: DropdownMenuItem,
  MenuSeparator: DropdownMenuSeparator,
};

const contextPrimitives = {
  MenuItem: ContextMenuItem,
  MenuSeparator: ContextMenuSeparator,
};

export function MeetingLibrary() {
  const navigate = useNavigate();
  const { isCompact } = useCompactMode();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("meetingViewMode") as "grid" | "list") || "grid";
  });
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [activeLabelIds, setActiveLabelIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search from anywhere on the page; Esc clears and leaves it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Debounce search input so we don't hit the backend on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { meetings, loading, refresh } = useMeetings(
    debouncedSearch || undefined,
    showArchived,
  );
  const { labels, meetingLabelsMap, addMeetingLabel, removeMeetingLabel, createLabel } = useLabels();

  const toggleLabel = useCallback((labelId: string) => {
    setActiveLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
  }, []);

  // Filter meetings by active labels (AND logic: meeting must have ALL selected labels)
  const filteredMeetings = useMemo(
    () =>
      activeLabelIds.size === 0
        ? meetings
        : meetings.filter((meeting) => {
            const meetingLabels = meetingLabelsMap[meeting.id] ?? [];
            const meetingLabelIds = new Set(meetingLabels.map((t) => t.id));
            return Array.from(activeLabelIds).every((labelId) => meetingLabelIds.has(labelId));
          }),
    [meetings, activeLabelIds, meetingLabelsMap],
  );

  // Drives the empty state copy: "no results" reads very differently from
  // "you haven't recorded anything yet".
  const hasFilters =
    debouncedSearch.trim().length > 0 || activeLabelIds.size > 0;

  const { pinnedIds, togglePin } = usePinnedMeetings();
  // Pinned meetings get their own group above the dated ones, in pin order.
  const groups = useMemo(() => {
    const byId = new Map(filteredMeetings.map((m) => [m.id, m]));
    const pinnedMeetings = pinnedIds.flatMap((id) => byId.get(id) ?? []);
    const pinned = new Set(pinnedMeetings.map((m) => m.id));
    const dated = groupByDay(filteredMeetings.filter((m) => !pinned.has(m.id)));
    return pinnedMeetings.length > 0
      ? [{ label: "Pinned", meetings: pinnedMeetings, pinned: true }, ...dated]
      : dated;
  }, [filteredMeetings, pinnedIds]);

  const handleViewModeChange = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("meetingViewMode", mode);
  }, []);

  // Reversible, so it happens straight away with an Undo rather than a
  // confirm dialog.
  const setArchived = useCallback(
    async (meeting: Meeting, archived: boolean) => {
      await (archived ? archiveMeeting : unarchiveMeeting)(meeting.id);
      refresh();
      toast(`${archived ? "Archived" : "Restored"} "${meeting.title}"`, {
        action: { label: "Undo", onClick: () => setArchived(meeting, !archived) },
      });
    },
    [refresh],
  );

  /** Cards and rows act as links: focusable, and Enter opens them like a click. */
  const linkProps = (meeting: Meeting) => {
    const open = () => navigate(`/meeting/${meeting.id}`);
    return {
      role: "link",
      tabIndex: 0,
      "aria-label": meeting.title,
      onClick: open,
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          open();
        }
      },
    };
  };

  // Transcribe a recording made elsewhere. The meeting opens right away and
  // fills in as transcription runs.
  const handleImport = useCallback(async () => {
    setImportError(null);
    const extensions = await invoke<string[]>("import_extensions");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio or video", extensions }],
    });
    if (typeof path !== "string") return;
    setImporting(true);
    try {
      const meeting = await invoke<Meeting>("import_recording", { path });
      navigate(`/meeting/${meeting.id}`);
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  }, [navigate]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteMeeting(deleteTarget.id);
    refresh();
  }, [deleteTarget, refresh]);

  const renderMenuItems = useCallback(
    (
      meeting: Meeting,
      primitives: {
        MenuItem: React.ComponentType<{
          children: React.ReactNode;
          onClick?: () => void;
          className?: string;
        }>;
        MenuSeparator: React.ComponentType<{ className?: string }>;
      },
    ) => (
      <MeetingActionMenuItems
        meeting={meeting}
        isPinned={pinnedIds.includes(meeting.id)}
        onTogglePin={() => togglePin(meeting.id)}
        onArchive={() => setArchived(meeting, true)}
        onUnarchive={() => setArchived(meeting, false)}
        onDelete={() => setDeleteTarget(meeting)}
        {...primitives}
      />
    ),
    [setArchived, pinnedIds, togglePin],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Meetings"
        description="Recorded meetings, transcripts, and summaries"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={importing}
            title="Transcribe an audio or video file"
          >
            <Upload /> {importing ? "Importing…" : "Import"}
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-5 overflow-auto p-6">
      {importError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <span className="min-w-0 flex-1">Couldn't import: {importError}</span>
          <button onClick={() => setImportError(null)} aria-label="Dismiss" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {!hasFilters && !showArchived && <UpcomingMeetings />}
      {!loading && !hasFilters && !showArchived && (
        <MomentumStrip meetings={meetings} />
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search titles and transcripts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                e.currentTarget.blur();
              }
            }}
            className="pl-9 pr-9"
          />
          {!search && (
            <Kbd className="absolute right-3 top-1/2 -translate-y-1/2">/</Kbd>
          )}
        </div>
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="icon"
          onClick={() => setShowArchived(!showArchived)}
          title={showArchived ? "Hide archived" : "Show archived"}
          aria-pressed={showArchived}
        >
          <Archive className="h-4 w-4" />
        </Button>
        <div className="flex rounded-md border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="rounded-r-none border-0"
            onClick={() => handleViewModeChange("grid")}
            title="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="rounded-l-none border-0"
            onClick={() => handleViewModeChange("list")}
            title="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {labels.map((label) => {
            const isActive = activeLabelIds.has(label.id);
            return (
              <button
                key={label.id}
                onClick={() => toggleLabel(label.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                  isActive
                    ? "border-transparent"
                    : "bg-transparent border-border text-foreground hover:bg-accent"
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: label.color,
                        borderColor: label.color,
                        color: labelTextColor(label.color),
                      }
                    : undefined
                }
              >
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                {label.name}
              </button>
            );
          })}
          {activeLabelIds.size > 0 && (
            <button
              onClick={() => setActiveLabelIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Meeting content */}
      {loading ? (
        <LoadingState message={LOADING_COPY.meetings} />
      ) : filteredMeetings.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={hasFilters ? "No matching meetings" : "No meetings yet"}
          description={
            hasFilters
              ? "Try a different search or clear your filters."
              : "Start a recording, or import an audio or video file, and it will show up here."
          }
          action={
            !hasFilters && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate("/recording")}>
                  <Circle /> New recording
                  <Kbd onSolid className="ml-1">⌘N</Kbd>
                </Button>
                <Button size="sm" variant="outline" onClick={handleImport} disabled={importing}>
                  <Upload /> Import a file
                </Button>
              </div>
            )
          }
        />
      ) : (
        groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {"pinned" in group && <Pin className="h-3 w-3" />}
            {group.label}
            <span className="ml-0.5 font-normal normal-case tracking-normal opacity-70">
              {group.meetings.length}
            </span>
          </h2>
      {viewMode === "grid" ? (
        <div className={`grid gap-4 ${isCompact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {group.meetings.map((meeting) => (
            <ContextMenu key={meeting.id}>
              <ContextMenuTrigger asChild>
                <div>
                  <Card
                    {...linkProps(meeting)}
                    className="group h-full cursor-pointer transition-colors hover:bg-accent/30 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium leading-snug line-clamp-2">
                          {meeting.title}
                        </h3>
                        <div className="flex items-center gap-1 shrink-0">
                          {showStatus(meeting.status) && (
                            <Badge variant={statusVariant(meeting.status)}>
                              {statusLabel(meeting.status)}
                            </Badge>
                          )}
                          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  aria-label="Meeting actions"
                                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded p-1 hover:bg-accent"
                                >
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {renderMenuItems(meeting, dropdownPrimitives)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{relativeWhen(meeting.start_time)}</span>
                        <span>·</span>
                        <span>
                          {formatDuration(
                            meeting.start_time,
                            meeting.end_time,
                          )}
                        </span>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <LabelEditor
                          meetingId={meeting.id}
                          meetingLabels={meetingLabelsMap[meeting.id] ?? []}
                          allLabels={labels}
                          onAddLabel={addMeetingLabel}
                          onRemoveLabel={removeMeetingLabel}
                          onCreateLabel={(name, color) => createLabel(name, color, null)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {renderMenuItems(meeting, contextPrimitives)}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {group.meetings.map((meeting) => (
            <ContextMenu key={meeting.id}>
              <ContextMenuTrigger asChild>
                <div
                  {...linkProps(meeting)}
                  className="group flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/30 outline-none focus-visible:bg-accent/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                >
                  <h3 className="flex-1 font-medium truncate">
                    {meeting.title}
                  </h3>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <LabelEditor
                      meetingId={meeting.id}
                      meetingLabels={meetingLabelsMap[meeting.id] ?? []}
                      allLabels={labels}
                      onAddLabel={addMeetingLabel}
                      onRemoveLabel={removeMeetingLabel}
                      onCreateLabel={(name, color) => createLabel(name, color, null)}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {relativeWhen(meeting.start_time)}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap w-12 text-right">
                    {formatDuration(meeting.start_time, meeting.end_time)}
                  </span>
                  {showStatus(meeting.status) && (
                    <Badge variant={statusVariant(meeting.status)} className="shrink-0">
                      {statusLabel(meeting.status)}
                    </Badge>
                  )}
                  <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Meeting actions"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded p-1 hover:bg-accent"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {renderMenuItems(meeting, dropdownPrimitives)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {renderMenuItems(meeting, contextPrimitives)}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      )}
        </section>
        ))
      )}

      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete meeting?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.title}</span>{" "}
            and its transcript, summaries, insights, and audio will be permanently
            deleted. This can't be undone.
          </>
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
