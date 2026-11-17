import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn, formatMs } from "@/lib/utils";
import type { Snapshot } from "@/types";

const altText = (snapshot: Snapshot) => `Shared screen at ${formatMs(snapshot.offset_ms)}`;

/** A snapshot thumbnail that opens it, with its time and a remove button. */
export function SnapshotTile({
  snapshot,
  onOpen,
  onRemove,
  className,
}: {
  snapshot: Snapshot;
  onOpen: () => void;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border bg-muted/30", className)}>
      <button className="block h-full w-full" onClick={onOpen} title="View snapshot">
        <img
          src={convertFileSrc(snapshot.image_path)}
          alt={altText(snapshot)}
          loading="lazy"
          className="aspect-video h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      </button>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
        {formatMs(snapshot.offset_ms)}
      </span>
      <button
        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
        onClick={onRemove}
        aria-label="Remove snapshot"
        title="Remove snapshot"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * The state a gallery of snapshots needs to open one large and to confirm
 * removing one. Render `lightbox` once beside the gallery.
 */
export function useSnapshotLightbox(snapshots: Snapshot[], onRemove: (id: string) => Promise<void>) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Snapshot | null>(null);
  const lightbox = (
    <SnapshotLightbox
      snapshots={snapshots}
      viewingId={viewingId}
      onViewingIdChange={setViewingId}
      removing={removing}
      onRemovingChange={setRemoving}
      onRemove={onRemove}
    />
  );
  return { open: setViewingId, askRemove: setRemoving, lightbox };
}

/**
 * Shows one snapshot large, stepping through the rest with the arrows or
 * ← →, and confirms before removing one. Snapshots taken while it's open
 * join the sequence without moving you off the one you're looking at.
 */
function SnapshotLightbox({
  snapshots,
  viewingId,
  onViewingIdChange,
  removing,
  onRemovingChange,
  onRemove,
}: {
  snapshots: Snapshot[];
  viewingId: string | null;
  onViewingIdChange: (id: string | null) => void;
  removing: Snapshot | null;
  onRemovingChange: (snapshot: Snapshot | null) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const index = snapshots.findIndex((s) => s.id === viewingId);
  const viewing = index >= 0 ? snapshots[index] : null;
  const prev = index > 0 ? snapshots[index - 1] : null;
  const next = index >= 0 && index < snapshots.length - 1 ? snapshots[index + 1] : null;

  return (
    <>
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && onViewingIdChange(null)}>
        <DialogContent
          className="max-w-4xl sm:max-w-4xl"
          onKeyDown={(e) => {
            const target = e.key === "ArrowLeft" ? prev : e.key === "ArrowRight" ? next : null;
            if (!target) return;
            e.preventDefault();
            onViewingIdChange(target.id);
          }}
        >
          {viewing && (
            <>
              <DialogTitle className="flex items-baseline gap-2 pr-8 text-sm">
                Snapshot at {formatMs(viewing.offset_ms)}
                {snapshots.length > 1 && (
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {index + 1} of {snapshots.length}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">
                A screen shared during the meeting
              </DialogDescription>
              <div className="group relative">
                <img
                  src={convertFileSrc(viewing.image_path)}
                  alt={altText(viewing)}
                  className="max-h-[65vh] w-full rounded-md border object-contain"
                />
                {prev && (
                  <StepButton side="left" onClick={() => onViewingIdChange(prev.id)} />
                )}
                {next && (
                  <StepButton side="right" onClick={() => onViewingIdChange(next.id)} />
                )}
              </div>
              {viewing.text.trim() && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Text in this snapshot</summary>
                  <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{viewing.text}</p>
                </details>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onRemovingChange(viewing);
                    onViewingIdChange(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && onRemovingChange(null)}
        title="Remove snapshot?"
        description="The image and its text are deleted, and won't be used in chat or future summaries."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing) await onRemove(removing.id);
        }}
      />
    </>
  );
}

const STEPS = {
  left: { Icon: ChevronLeft, label: "Previous snapshot", title: "Previous (←)", position: "left-2" },
  right: { Icon: ChevronRight, label: "Next snapshot", title: "Next (→)", position: "right-2" },
};

function StepButton({ side, onClick }: { side: keyof typeof STEPS; onClick: () => void }) {
  const { Icon, label, title, position } = STEPS[side];
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={title}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white shadow-md backdrop-blur-sm transition-[opacity,background-color] hover:bg-black/75 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
        position,
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
