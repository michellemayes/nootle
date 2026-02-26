import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAllInsights } from "@/hooks/useInsights";
import type { InsightWithActionItem } from "@/types";
import { Check, Lightbulb, ListChecks, Star, Search } from "lucide-react";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DashboardActionItem({
  item,
  onToggle,
  onNavigate,
}: {
  item: InsightWithActionItem;
  onToggle: (actionItemId: string, currentStatus: string) => void;
  onNavigate: (meetingId: string) => void;
}) {
  const isDone = item.status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/30"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (item.action_item_id) onToggle(item.action_item_id, item.status ?? "open");
        }}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          isDone
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground hover:border-primary"
        }`}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => onNavigate(item.meeting_id)}
      >
        <p className={`text-sm leading-relaxed ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.content}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant={isDone ? "secondary" : "outline"} className="text-[10px]">
            {isDone ? "Done" : "Open"}
          </Badge>
          {item.assignee && (
            <span className="text-[10px] text-muted-foreground">{item.assignee}</span>
          )}
          {item.due_date && (
            <span className="text-[10px] text-muted-foreground">{item.due_date}</span>
          )}
          {item.meeting_title && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              {item.meeting_title}
            </span>
          )}
          {item.meeting_start_time && (
            <span className="text-[10px] text-muted-foreground">
              {formatDate(item.meeting_start_time)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function InsightItem({
  item,
  icon: Icon,
  onNavigate,
}: {
  item: InsightWithActionItem;
  icon: React.ComponentType<{ className?: string }>;
  onNavigate: (meetingId: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-accent/30"
      onClick={() => onNavigate(item.meeting_id)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed">{item.content}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.meeting_title && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              {item.meeting_title}
            </span>
          )}
          {item.meeting_start_time && (
            <span className="text-[10px] text-muted-foreground">
              {formatDate(item.meeting_start_time)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <Badge variant="secondary">{count}</Badge>
    </div>
  );
}

export function InsightsDashboard() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState<string | undefined>(undefined);

  const { decisions, actionItems, keyMoments, loading, toggleActionItem } = useAllInsights(
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

  const handleNavigate = (meetingId: string) => {
    navigate(`/meeting/${meetingId}`);
  };

  const openItems = actionItems.filter((i) => i.status !== "done");
  const doneItems = actionItems.filter((i) => i.status === "done");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-8 py-4">
        <h1 className="text-xl font-bold">Insights</h1>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter ?? ""}
            onChange={(e) => setTypeFilter(e.target.value || undefined)}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All types</option>
            <option value="decision">Decisions</option>
            <option value="action_item">Action Items</option>
            <option value="key_moment">Key Moments</option>
          </select>
          <select
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter(e.target.value || undefined)}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search insights..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 w-56 pl-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading insights...</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-8 p-8">
            {/* Action Items */}
            {(typeFilter === undefined || typeFilter === "action_item") && (
              <section>
                <SectionHeader icon={ListChecks} title="Action Items" count={actionItems.length} />
                <div className="space-y-2">
                  {openItems.length === 0 && doneItems.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No action items found</p>
                  )}
                  {openItems.map((item) => (
                    <DashboardActionItem
                      key={item.id}
                      item={item}
                      onToggle={toggleActionItem}
                      onNavigate={handleNavigate}
                    />
                  ))}
                  {doneItems.map((item) => (
                    <DashboardActionItem
                      key={item.id}
                      item={item}
                      onToggle={toggleActionItem}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Decisions */}
            {(typeFilter === undefined || typeFilter === "decision") && (
              <section>
                <SectionHeader icon={Lightbulb} title="Recent Decisions" count={decisions.length} />
                <div className="space-y-2">
                  {decisions.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No decisions found</p>
                  )}
                  {decisions.map((item) => (
                    <InsightItem
                      key={item.id}
                      item={item}
                      icon={Lightbulb}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Key Moments */}
            {(typeFilter === undefined || typeFilter === "key_moment") && (
              <section>
                <SectionHeader icon={Star} title="Key Moments" count={keyMoments.length} />
                <div className="space-y-2">
                  {keyMoments.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No key moments found</p>
                  )}
                  {keyMoments.map((item) => (
                    <InsightItem
                      key={item.id}
                      item={item}
                      icon={Star}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </ScrollArea>
      )}
    </motion.div>
  );
}
