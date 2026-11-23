import { Handshake, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { SourceCitation } from "@/components/SourceCitation";
import type { LiveAssistCard } from "@/types";

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button onClick={onDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

type CardProps = {
  card: LiveAssistCard;
  onDismiss: () => void;
  onOpenMeeting: (path: string) => void;
};

/** An open commitment from an earlier meeting, brought up as its owner speaks. */
function ReminderCard({ card, onDismiss, onOpenMeeting }: CardProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs">
      <Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="leading-relaxed text-foreground">{card.question}</p>
        {card.sources.map((s, i) => (
          <SourceCitation key={i} source={s} onOpenMeeting={onOpenMeeting} />
        ))}
      </div>
      <DismissButton onDismiss={onDismiss} />
    </div>
  );
}

/** A question heard or typed, with its answer and sources. */
function AnswerCard({ card, onDismiss, onOpenMeeting }: CardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-xs">
      <div className="mb-1.5 flex items-start gap-2">
        <p className="flex-1 text-xs text-muted-foreground">
          {card.automatic ? "Heard: " : "You asked: "}
          <span className="text-foreground">{card.question}</span>
        </p>
        <DismissButton onDismiss={onDismiss} />
      </div>
      {card.answer && <Markdown content={card.answer} />}
      {card.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.sources.map((s, i) => (
            <SourceCitation key={i} source={s} onOpenMeeting={onOpenMeeting} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Live Assist's cards, newest first, or what to expect when there are none. */
export function LiveAssistCards({
  shown,
  noCards,
  noneShown,
  auto,
  hasModel,
  onDismiss,
  onOpenMeeting,
}: {
  shown: LiveAssistCard[];
  /** No cards at all yet, in any filter. */
  noCards: boolean;
  /** What to say when this filter hides every card. */
  noneShown: string;
  auto: boolean;
  hasModel: boolean;
  onDismiss: (id: string) => void;
  onOpenMeeting: (path: string) => void;
}) {
  return (
    <div className="space-y-3 p-4" role="log" aria-live="polite">
      {!noCards && shown.length === 0 && <p className="text-xs text-muted-foreground">{noneShown}</p>}
      {noCards && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {auto
            ? "Listening for questions. When someone asks something your documents or past meetings can answer, the answer shows up here with its sources. Open commitments from earlier meetings are brought up when their owner speaks or their topic comes up."
            : "Ask your documents and past meetings anything below. Turn on Auto to have questions heard in the meeting answered as they come up."}
          {!hasModel && " Pick an AI model in the sidebar for written answers; without one, Nootle shows the passages it found."}
        </p>
      )}
      {shown.map((card) => {
        const Card = card.commitment_id ? ReminderCard : AnswerCard;
        return <Card key={card.id} card={card} onDismiss={() => onDismiss(card.id)} onOpenMeeting={onOpenMeeting} />;
      })}
    </div>
  );
}
