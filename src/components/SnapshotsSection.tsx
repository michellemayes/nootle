import { Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SnapshotTile, useSnapshotLightbox } from "@/components/SnapshotLightbox";
import type { Snapshot } from "@/types";

/** Snapshots of shared screens, shown at the bottom of a meeting's notes. */
export function SnapshotsSection({
  snapshots,
  onRemove,
}: {
  snapshots: Snapshot[];
  onRemove: (id: string) => Promise<void>;
}) {
  const { open, askRemove, lightbox } = useSnapshotLightbox(snapshots, onRemove);

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
          <SnapshotTile
            key={snapshot.id}
            snapshot={snapshot}
            onOpen={() => open(snapshot.id)}
            onRemove={() => askRemove(snapshot)}
          />
        ))}
      </div>
      {lightbox}
    </div>
  );
}
