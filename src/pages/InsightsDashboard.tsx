import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { useAllInsights } from "@/hooks/useInsights";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
import type { InsightWithActionItem, InsightType, LinearTeam } from "@/types";
import type { LucideIcon } from "lucide-react";
import { Lightbulb, Search, Ticket } from "lucide-react";
import { ActionItemCheckbox } from "@/components/ActionItemCheckbox";
import { formatDate } from "@/lib/utils";
import { insightIcon } from "@/lib/insightIcons";

function ActionItemTicketButton({
  item,
  teams,
  onTicketCreated,
}: {
  item: InsightWithActionItem;
  teams: LinearTeam[];
  onTicketCreated: () => void;
}) {
  const { storedProviders } = useApiKeys();
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const { defaultTeamId, defaultProjectId } = useLinearSettings();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const { projects } = useLinearProjects(teamId || null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The defaults load after the first render, so adopt them once they arrive.
  useEffect(() => {
    if (defaultTeamId && !teamId) setTeamId(defaultTeamId);
  }, [defaultTeamId, teamId]);

  useEffect(() => {
    if (defaultProjectId && !projectId) setProjectId(defaultProjectId);
  }, [defaultProjectId, projectId]);

  if (!storedProviders.includes("linear")) return null;

  if (item.linear_ticket_id) {
    return (
      <Badge variant="secondary" size="sm" className="shrink-0">
        <Ticket />
        {item.linear_ticket_id}
      </Badge>
    );
  }

  const handleCreate = async () => {
    if (!item.action_item_id || !teamId || !selectedProvider || !selectedModel) return;
    setCreating(true);
    setError(null);
    try {
      await invoke("create_ticket_from_action_item", {
        actionItemId: item.action_item_id,
        teamId,
        projectId: projectId || null,
        provider: selectedProvider,
        model: selectedModel,
      });
      setOpen(false);
      onTicketCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary transition-colors"
        title="Create Linear ticket"
        aria-label="Create Linear ticket"
      >
        <Ticket className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div
      className="shrink-0 border rounded-md p-2 space-y-2 bg-background"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex gap-1.5">
        <Select
          size="xs"
          containerClassName="flex-1"
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setProjectId("");
          }}
          aria-label="Linear team"
        >
          <option value="">Team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <Select
          size="xs"
          containerClassName="flex-1"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Linear project"
        >
          <option value="">Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex gap-1.5">
        <Button
          size="xs"
          className="flex-1"
          onClick={handleCreate}
          disabled={creating || !teamId || !selectedProvider || !selectedModel}
        >
          {creating ? "Creating…" : "Create ticket"}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DashboardActionItem({
  item,
  teams,
  onToggle,
  onNavigate,
  onTicketCreated,
}: {
  item: InsightWithActionItem;
  teams: LinearTeam[];
  onToggle: (actionItemId: string, currentStatus: string) => void;
  onNavigate: (meetingId: string) => void;
  onTicketCreated: () => void;
}) {
  const isDone = item.status === "done";

  return (
    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/30">
      <ActionItemCheckbox
        done={isDone}
        label={item.content}
        onToggle={() => {
          if (item.action_item_id) onToggle(item.action_item_id, item.status ?? "open");
        }}
      />
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => onNavigate(item.meeting_id)}
      >
        <p className={`text-sm leading-relaxed ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.content}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={isDone ? "secondary" : "outline"} size="sm">
            {isDone ? "Done" : "Open"}
          </Badge>
          {item.assignee && <span>{item.assignee}</span>}
          {item.due_date && <span>{item.due_date}</span>}
          {item.meeting_title && (
            <span className="max-w-[200px] truncate">{item.meeting_title}</span>
          )}
          {item.meeting_start_time && (
            <span>{formatDate(item.meeting_start_time)}</span>
          )}
        </div>
      </div>
      <ActionItemTicketButton item={item} teams={teams} onTicketCreated={onTicketCreated} />
    </div>
  );
}

function InsightItem({
  item,
  icon: Icon,
  onNavigate,
}: {
  item: InsightWithActionItem;
  icon: LucideIcon;
  onNavigate: (meetingId: string) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-accent/30"
      onClick={() => onNavigate(item.meeting_id)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed">{item.content}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {item.meeting_title && (
            <span className="max-w-[200px] truncate">{item.meeting_title}</span>
          )}
          {item.meeting_start_time && (
            <span>{formatDate(item.meeting_start_time)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-base font-semibold">{title}</h2>
      <Badge variant="secondary" size="sm">{count}</Badge>
    </div>
  );
}

function TypeSection({
  insightType,
  items,
  teams,
  toggleActionItem,
  onNavigate,
  onTicketCreated,
}: {
  insightType: InsightType;
  items: InsightWithActionItem[];
  teams: LinearTeam[];
  toggleActionItem: (actionItemId: string, currentStatus: string) => void;
  onNavigate: (meetingId: string) => void;
  onTicketCreated: () => void;
}) {
  const Icon = insightIcon(insightType.icon);

  if (insightType.has_action_fields) {
    // Open items first, done ones sink to the bottom.
    const ordered = [
      ...items.filter((i) => i.status !== "done"),
      ...items.filter((i) => i.status === "done"),
    ];
    return (
      <section>
        <SectionHeader icon={Icon} title={insightType.name + "s"} count={items.length} />
        <div className="space-y-2">
          {ordered.length === 0 && (
            <p className="text-sm text-muted-foreground">No {insightType.name.toLowerCase()}s</p>
          )}
          {ordered.map((item) => (
            <DashboardActionItem
              key={item.id}
              item={item}
              teams={teams}
              onToggle={toggleActionItem}
              onNavigate={onNavigate}
              onTicketCreated={onTicketCreated}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader icon={Icon} title={insightType.name + "s"} count={items.length} />
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No {insightType.name.toLowerCase()}s</p>
        )}
        {items.map((item) => (
          <InsightItem
            key={item.id}
            item={item}
            icon={Icon}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

export function InsightsDashboard() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState<string | undefined>(undefined);
  const { teams, fetchTeams } = useLinearTeams();

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const { insightTypes, groupedByType, loading, toggleActionItem, refresh } = useAllInsights(
    typeFilter,
    statusFilter,
    searchDebounced,
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchDebounced(value || undefined);
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const handleNavigate = (meetingId: string) => {
    navigate(`/meeting/${meetingId}`);
  };

  const visibleTypes = insightTypes.filter(
    (t) => typeFilter === undefined || typeFilter === t.slug,
  );
  const totalItems = visibleTypes.reduce(
    (sum, t) => sum + (groupedByType[t.slug]?.length ?? 0),
    0,
  );
  const hasFilters = !!typeFilter || !!statusFilter || !!searchDebounced;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Insights"
        description="Action items, decisions, and key moments from your meetings"
      />

      <div className="flex shrink-0 items-center gap-3 px-6 pt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search insights…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter ?? ""}
          onChange={(e) => setTypeFilter(e.target.value || undefined)}
          aria-label="Filter by insight type"
        >
          <option value="">All types</option>
          {insightTypes.map((t) => (
            <option key={t.slug} value={t.slug}>{t.name}s</option>
          ))}
        </Select>
        <Select
          value={statusFilter ?? ""}
          onChange={(e) => setStatusFilter(e.target.value || undefined)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
        </Select>
      </div>

      {loading ? (
        <LoadingState message={LOADING_COPY.insights} />
      ) : totalItems === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={hasFilters ? "No matching insights" : "No insights yet"}
          description={
            hasFilters
              ? "Try a different search or clear your filters."
              : "Open a meeting and extract insights from its Insights tab."
          }
        />
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-8 p-6">
            {visibleTypes.map((t) => (
              <TypeSection
                key={t.slug}
                insightType={t}
                items={groupedByType[t.slug] ?? []}
                teams={teams}
                toggleActionItem={toggleActionItem}
                onNavigate={handleNavigate}
                onTicketCreated={refresh}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
