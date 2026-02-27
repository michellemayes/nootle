import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

const LOADING_MESSAGES = [
  "Warming up the noodles...",
  "Untangling the transcript...",
  "Slurping through the data...",
  "Almost there, just al dente...",
];
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import {
  useMeetings,
  deleteMeeting,
  archiveMeeting,
  unarchiveMeeting,
  updateMeetingCategory,
} from "@/hooks/useMeetings";
import { useCategories } from "@/hooks/useCategories";
import { MeetingActionMenuItems } from "@/components/MeetingActionMenuItems";
import { DeleteMeetingDialog } from "@/components/DeleteMeetingDialog";
import { NewCategoryDialog } from "@/components/NewCategoryDialog";
import type { Meeting } from "@/types";
import {
  Search,
  Mic,
  MoreVertical,
  LayoutGrid,
  List,
  Archive,
} from "lucide-react";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}m`;
}

function statusColor(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "recording":
      return "destructive";
    case "transcribing":
      return "secondary";
    case "summarized":
      return "default";
    default:
      return "outline";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "recording":
      return "Recording";
    case "transcribing":
      return "Transcribing";
    case "summarized":
      return "Done";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

export function MeetingLibrary() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(
    undefined,
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("meetingViewMode") as "grid" | "list") || "grid";
  });
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [newCategoryTarget, setNewCategoryTarget] = useState<Meeting | null>(
    null,
  );
  const [loadingMessage] = useState(
    () =>
      LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)],
  );
  const { meetings, loading, refresh } = useMeetings(
    categoryFilter,
    search || undefined,
    showArchived,
  );
  const { categories, createCategory } = useCategories();

  const handleViewModeChange = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("meetingViewMode", mode);
  }, []);

  const handleArchive = useCallback(
    async (meeting: Meeting) => {
      await archiveMeeting(meeting.id);
      refresh();
    },
    [refresh],
  );

  const handleUnarchive = useCallback(
    async (meeting: Meeting) => {
      await unarchiveMeeting(meeting.id);
      refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteMeeting(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  }, [deleteTarget, refresh]);

  const handleCategorySelect = useCallback(
    async (meeting: Meeting, categoryId: string | null) => {
      await updateMeetingCategory(meeting.id, categoryId);
      refresh();
    },
    [refresh],
  );

  const handleNewCategory = useCallback(
    async (name: string, color: string) => {
      if (!newCategoryTarget) return;
      const category = await createCategory(name, color);
      await updateMeetingCategory(newCategoryTarget.id, category.id);
      setNewCategoryTarget(null);
      refresh();
    },
    [newCategoryTarget, createCategory, refresh],
  );

  const renderMenuItems = useCallback(
    (
      meeting: Meeting,
      primitives: {
        MenuItem: React.ComponentType<{
          children: React.ReactNode;
          onClick?: () => void;
          className?: string;
        }>;
        MenuSub: React.ComponentType<{ children: React.ReactNode }>;
        MenuSubTrigger: React.ComponentType<{
          children: React.ReactNode;
          className?: string;
        }>;
        MenuSubContent: React.ComponentType<{
          children: React.ReactNode;
          className?: string;
        }>;
        MenuSeparator: React.ComponentType<{ className?: string }>;
      },
    ) => (
      <MeetingActionMenuItems
        meeting={meeting}
        categories={categories}
        onArchive={() => handleArchive(meeting)}
        onUnarchive={() => handleUnarchive(meeting)}
        onDelete={() => setDeleteTarget(meeting)}
        onCategorySelect={(catId) => handleCategorySelect(meeting, catId)}
        onNewCategory={() => setNewCategoryTarget(meeting)}
        {...primitives}
      />
    ),
    [categories, handleArchive, handleUnarchive, handleCategorySelect],
  );

  const dropdownPrimitives = {
    MenuItem: DropdownMenuItem,
    MenuSub: DropdownMenuSub,
    MenuSubTrigger: DropdownMenuSubTrigger,
    MenuSubContent: DropdownMenuSubContent,
    MenuSeparator: DropdownMenuSeparator,
  };

  const contextPrimitives = {
    MenuItem: ContextMenuItem,
    MenuSub: ContextMenuSub,
    MenuSubTrigger: ContextMenuSubTrigger,
    MenuSubContent: ContextMenuSubContent,
    MenuSeparator: ContextMenuSeparator,
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your recorded meetings and transcriptions
        </p>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {categoryFilter
                ? categories.find((c) => c.id === categoryFilter)?.name ??
                  "Category"
                : "All Categories"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setCategoryFilter(undefined)}>
              All Categories
            </DropdownMenuItem>
            {categories.map((cat) => (
              <DropdownMenuItem
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
              >
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
          title={showArchived ? "Hide archived" : "Show archived"}
        >
          <Archive className="h-4 w-4" />
        </Button>
        <div className="flex rounded-md border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-r-none border-0"
            onClick={() => handleViewModeChange("grid")}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-l-none border-0"
            onClick={() => handleViewModeChange("list")}
            title="List view"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Meeting content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{loadingMessage}</p>
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          {search.toLowerCase() === "noodle" ? (
            <>
              <span className="text-4xl">{"\uD83C\uDF5C"}</span>
              <h2 className="text-lg font-medium">
                You found the secret noodle!
              </h2>
              <p className="text-sm text-muted-foreground">
                Unfortunately, it's not a meeting.
              </p>
            </>
          ) : (
            <>
              <Mic className="h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-medium">No meetings yet</h2>
              <p className="text-sm text-muted-foreground">
                Hit record and let Nootle do its thing
              </p>
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <ContextMenu key={meeting.id}>
              <ContextMenuTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className="group cursor-pointer transition-colors hover:bg-accent/30 hover:shadow-md"
                    onClick={() => navigate(`/meeting/${meeting.id}`)}
                  >
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium leading-snug line-clamp-2">
                          {meeting.title}
                        </h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant={statusColor(meeting.status)}
                          >
                            {statusLabel(meeting.status)}
                          </Badge>
                          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-accent"
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
                        <span>{formatDate(meeting.start_time)}</span>
                        <span>{"\u00B7"}</span>
                        <span>
                          {formatDuration(
                            meeting.start_time,
                            meeting.end_time,
                          )}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {renderMenuItems(meeting, contextPrimitives)}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {meetings.map((meeting) => (
            <ContextMenu key={meeting.id}>
              <ContextMenuTrigger asChild>
                <div
                  className="group flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/30"
                  onClick={() => navigate(`/meeting/${meeting.id}`)}
                >
                  <h3 className="flex-1 font-medium truncate">
                    {meeting.title}
                  </h3>
                  {meeting.category_id && (() => {
                    const cat = categories.find(
                      (c) => c.id === meeting.category_id,
                    );
                    return cat ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </span>
                    ) : null;
                  })()}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(meeting.start_time)}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap w-12 text-right">
                    {formatDuration(meeting.start_time, meeting.end_time)}
                  </span>
                  <Badge variant={statusColor(meeting.status)} className="shrink-0">
                    {statusLabel(meeting.status)}
                  </Badge>
                  <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-accent"
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

      {/* Dialogs */}
      <DeleteMeetingDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        meetingTitle={deleteTarget?.title ?? ""}
        onConfirm={handleDelete}
      />
      <NewCategoryDialog
        open={newCategoryTarget !== null}
        onOpenChange={(open) => !open && setNewCategoryTarget(null)}
        onSubmit={handleNewCategory}
      />
    </div>
  );
}
