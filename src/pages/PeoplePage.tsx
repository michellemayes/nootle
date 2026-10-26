import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ActionItemCheckbox } from "@/components/ActionItemCheckbox";
import { CommitmentRow, isPending } from "@/components/CommitmentRow";
import { useCommitments } from "@/hooks/useCommitments";
import { CoachTrends } from "@/components/Coach";
import { useBooleanSetting } from "@/hooks/useBooleanSetting";
import { COACH_SETTING, useCoachTrends } from "@/hooks/useCoach";
import { formatDate, cn, plural } from "@/lib/utils";
import type { CommitmentStatus, InsightWithActionItem, Meeting } from "@/types";

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
 * talked about, and what they owe. With Meeting Coach on, "You" leads the
 * list with your coaching trends. */
export function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [searchParams] = useSearchParams();
  // "you" is your coaching trends, listed first while Meeting Coach is on.
  const [selected, setSelected] = useState<Person | "you" | null>(
    searchParams.has("coach") ? "you" : null,
  );
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [coachEnabled] = useBooleanSetting(COACH_SETTING, false);
  const trends = useCoachTrends(coachEnabled);
  const person = selected === "you" ? null : selected;
  const showYou = coachEnabled && (selected === "you" || !selected);

  useEffect(() => {
    invoke<Person[]>("list_people")
      .then((list) => {
        setPeople(list);
        setSelected((current) => current ?? list[0] ?? null);
      })
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    if (!person) return;
    invoke<PersonDetail>("get_person", { name: person.name }).then(setDetail).catch(() => {});
  }, [person]);
  const { commitments, setStatus, refresh: refreshCommitments } = useCommitments(person?.name);
  const owed = (commitments ?? []).filter(isPending);
  // A commitment is one of their action items, so both lists follow it.
  const setCommitmentStatus = async (id: string, status: CommitmentStatus) => {
    await setStatus(id, status);
    if (person) invoke<PersonDetail>("get_person", { name: person.name }).then(setDetail).catch(() => {});
    invoke<Person[]>("list_people").then(setPeople).catch(() => {});
  };

  // Updated in place: the list's open count and this item flip together.
  const toggle = async (item: InsightWithActionItem) => {
    if (!item.action_item_id) return;
    const status = item.status === "done" ? "open" : "done";
    try {
      await invoke("update_action_item_status", { id: item.action_item_id, status });
    } catch {
      return;
    }
    refreshCommitments();
    setDetail((d) =>
      d && {
        ...d,
        action_items: d.action_items.map((i) => (i.id === item.id ? { ...i, status } : i)),
      },
    );
    setPeople((list) =>
      list?.map((p) =>
        p.name === detail?.name
          ? { ...p, open_action_items: p.open_action_items + (status === "done" ? -1 : 1) }
          : p,
      ) ?? null,
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="People"
        description="Everyone you've named in a transcript, and what you've discussed"
      />
      {people === null ? (
        <LoadingState message="Loading people…" />
      ) : people.length === 0 && !coachEnabled ? (
        <EmptyState
          icon={Users}
          title="No people yet"
          description="Click a speaker's name in a meeting's transcript and give them their real name. They'll show up here with every meeting you've had together. Turn on Remember voices in Settings to have Nootle name them for you next time."
        />
      ) : (
        // Side by side when there's room; in a narrow window the list sits
        // above the details instead of squeezing them.
        <div className="flex min-h-0 flex-1 flex-col @2xl/main:flex-row">
          <ScrollArea className="max-h-48 shrink-0 border-b @2xl/main:max-h-none @2xl/main:w-64 @2xl/main:border-r @2xl/main:border-b-0">
            <ul className="p-2">
              {coachEnabled && (
                <li>
                  <button
                    onClick={() => setSelected("you")}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                      showYou && "bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                      You
                    </span>
                    <p className="text-xs text-muted-foreground">Your coaching trends</p>
                  </button>
                </li>
              )}
              {people.map((p) => (
                <li key={p.name}>
                  <button
                    onClick={() => setSelected(p)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                      person?.name === p.name && "bg-muted",
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
                      {plural(p.meeting_count, "meeting")} · last{" "}
                      {formatDate(p.last_met)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <ScrollArea className="min-h-0 flex-1">
            {showYou && <CoachTrends points={trends} />}
            {detail && person && detail.name === person.name && (
              <div className="max-w-3xl space-y-8 p-6">
                <div>
                  <h2 className="text-lg font-semibold">{detail.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Talked for {minutes(person.talk_time_ms)} across{" "}
                    {plural(person.meeting_count, "meeting")}
                  </p>
                </div>
                {owed.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-medium">Open commitments</h3>
                    <div className="space-y-2">
                      {owed.map((c) => (
                        <CommitmentRow key={c.id} commitment={c} onSetStatus={setCommitmentStatus} showOwner={false} />
                      ))}
                    </div>
                  </section>
                )}
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
