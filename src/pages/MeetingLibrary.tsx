import { useState } from "react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/hooks/useMeetings";
import { useCategories } from "@/hooks/useCategories";
import type { Meeting } from "@/types";
import { Search, Mic } from "lucide-react";

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

function statusColor(status: string): "default" | "secondary" | "outline" | "destructive" {
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

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="cursor-pointer transition-colors hover:bg-accent/30 hover:shadow-md"
        onClick={() => navigate(`/meeting/${meeting.id}`)}
      >
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium leading-snug line-clamp-2">
              {meeting.title}
            </h3>
            <Badge variant={statusColor(meeting.status)} className="shrink-0">
              {meeting.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatDate(meeting.start_time)}</span>
            <span>{"\u00B7"}</span>
            <span>{formatDuration(meeting.start_time, meeting.end_time)}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function MeetingLibrary() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(
    undefined,
  );
  const [loadingMessage] = useState(() => LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
  const { meetings, loading } = useMeetings(categoryFilter, search || undefined);
  const { categories } = useCategories();

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
      </div>

      {/* Meeting grid */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{loadingMessage}</p>
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          {search.toLowerCase() === "noodle" ? (
            <>
              <span className="text-4xl">{"\uD83C\uDF5C"}</span>
              <h2 className="text-lg font-medium">You found the secret noodle!</h2>
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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}
    </div>
  );
}
