import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Images, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatMs } from "@/lib/utils";
import type { Snapshot } from "@/types";

/** Snapshots of shared screens, shown at the bottom of a meeting's notes. */
export function SnapshotsSection({
  snapshots,
  onRemove,
}: {
  snapshots: Snapshot[];
  onRemove: (id: string) => Promise<void>;
}) {
  const [viewing, setViewing] = useState<Snapshot | null>(null);
  const [removing, setRemoving] = useState<Snapshot | null>(null);

  if (snapshots.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Images className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Snapshots</h3>
        <Badge variant="secondary" size="sm">
          {snapshots.length}
        </Badge>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="group relative overflow-hidden rounded-lg border bg-muted/30">
            <button
              className="block w-full"
              onClick={() => setViewing(snapshot)}
              title="View snapshot"
            >
              <img
                src={convertFileSrc(snapshot.image_path)}
                alt={`Shared screen at ${formatMs(snapshot.offset_ms)}`}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
            </button>
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {formatMs(snapshot.offset_ms)}
            </span>
            <button
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => setRemoving(snapshot)}
              aria-label="Remove snapshot"
              title="Remove snapshot"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-4xl sm:max-w-4xl">
          {viewing && (
            <>
              <DialogTitle className="text-sm">
                Snapshot at {formatMs(viewing.offset_ms)}
              </DialogTitle>
              <DialogDescription className="sr-only">
                A screen shared during the meeting
              </DialogDescription>
              <img
                src={convertFileSrc(viewing.image_path)}
                alt={`Shared screen at ${formatMs(viewing.offset_ms)}`}
                className="max-h-[65vh] w-full rounded-md border object-contain"
              />
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
                    setRemoving(viewing);
                    setViewing(null);
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
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove snapshot?"
        description="The image and its text are deleted, and won't be used in chat or future summaries."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing) await onRemove(removing.id);
        }}
      />
    </div>
  );
}
