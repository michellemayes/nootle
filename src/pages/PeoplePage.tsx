import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ActionItemCheckbox } from "@/components/ActionItemCheckbox";
import { formatDate, cn } from "@/lib/utils";
import type { InsightWithActionItem, Meeting } from "@/types";

interface Person {
  name: string;
  meeting_count: number;
  last_met: string;
  talk_time_ms: number;
  open_action_items: number;
}

interface PersonDetail {
  name: string;
  meetings: Meeting[];
  action_items: InsightWithActionItem[];
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? "under a minute" : `${m} min`;
}

/** Everyone you've named as a speaker: when you last met, what you
 * talked about, and what they owe. */
export function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  useEffect(() => {
    invoke<Person[]>("list_people")
      .then((list) => {
        setPeople(list);
        setSelected((current) => current ?? list[0]?.name ?? null);
      })
      .catch(() => setPeople([]));
  }, []);

  const loadDetail = useCallback((name: string) => {
    invoke<PersonDetail>("get_person", { name }).then(setDetail).catch(() => {});
  }, []);
  useEffect(() => {
    if (selected) loadDetail(selected);
  }, [selected, loadDetail]);

  const toggle = async (item: InsightWithActionItem) => {
    if (!item.action_item_id) return;
    await invoke("update_action_item_status", {
      id: item.action_item_id,
      status: item.status === "done" ? "open" : "done",
    }).catch(() => {});
    if (selected) loadDetail(selected);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="People"
        description="Everyone you've named in a transcript, and what you've discussed"
      />
      {people === null ? (
        <LoadingState message="Loading people…" />
      ) : people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No people yet"
          description="Click a speaker's name in a meeting's transcript and give them their real name. They'll show up here with every meeting you've had together. Turn on Remember voices in Settings to have Nootle name them for you next time."
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ScrollArea className="w-64 shrink-0 border-r">
            <ul className="p-2">
              {people.map((p) => (
                <li key={p.name}>
                  <button
                    onClick={() => setSelected(p.name)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                      selected === p.name && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.open_action_items > 0 && (
                        <Badge variant="secondary" size="sm">
                          {p.open_action_items}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.meeting_count} {p.meeting_count === 1 ? "meeting" : "meetings"} · last{" "}
                      {formatDate(p.last_met)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <ScrollArea className="flex-1">
            {detail && detail.name === selected && (
              <div className="max-w-3xl space-y-8 p-6">
                <div>
                  <h2 className="text-lg font-semibold">{detail.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const p = people.find((x) => x.name === detail.name);
                      return p
                        ? `Talked for ${minutes(p.talk_time_ms)} across ${p.meeting_count} ${p.meeting_count === 1 ? "meeting" : "meetings"}`
                        : null;
                    })()}
                  </p>
                </div>
                <section>
                  <h3 className="mb-2 text-sm font-medium">Action items</h3>
                  {detail.action_items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing assigned to them.</p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.action_items.map((item) => (
                        <li key={item.id} className="flex items-start gap-2 text-sm">
                          <ActionItemCheckbox
                            done={item.status === "done"}
                            onToggle={() => toggle(item)}
                            label={item.content}
                          />
                          <span className={cn(item.status === "done" && "line-through text-muted-foreground")}>
                            {item.content}
                            <Link
                              to={`/meeting/${item.meeting_id}`}
                              className="ml-2 text-xs text-muted-foreground hover:underline"
                            >
                              {item.meeting_title}
                            </Link>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">Meetings</h3>
                  <ul className="divide-y">
                    {detail.meetings.map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/meeting/${m.id}`}
                          className="flex items-center justify-between py-2 text-sm hover:underline"
                        >
                          <span className="truncate">{m.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDate(m.start_time)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
