import { memo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Images } from "lucide-react";
import { Collapsible } from "@/components/Collapsible";
import { PanelToggle } from "@/components/PanelToggle";
import { SnapshotTile, useSnapshotLightbox } from "@/components/SnapshotLightbox";
import { usePersistedToggle } from "@/hooks/usePersistedToggle";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import type { Snapshot } from "@/types";

/** A filmstrip of the snapshots taken so far in a live recording, newest on the right. */
export const LiveSnapshots = memo(function LiveSnapshots({
  snapshots,
  onRemove,
}: {
  snapshots: Snapshot[];
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = usePersistedToggle("recordingSnapshotsOpen", true);
  const { open: view, askRemove, lightbox } = useSnapshotLightbox(snapshots, onRemove);
  const stripRef = useRef<HTMLDivElement>(null);
  // Brings each new snapshot into view, unless you've scrolled back through older ones.
  const { sentinelRef } = useStickToBottom(stripRef, snapshots.length, { axis: "x" });

  return (
    <div className="border-t">
      <PanelToggle
        open={open}
        onOpenChange={setOpen}
        icon={<Images className="h-3.5 w-3.5" />}
        count={snapshots.length}
      >
        Snapshots
      </PanelToggle>
      <Collapsible open={open}>
        <div
          ref={stripRef}
          data-layout-scroll-x
          role="list"
          aria-label="Snapshots so far"
          className="flex gap-2 overflow-x-auto px-6 pb-3 [scrollbar-width:thin]"
        >
          <AnimatePresence initial={false}>
            {snapshots.map((snapshot) => (
              <motion.div
                key={snapshot.id}
                role="listitem"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="aspect-video h-20 shrink-0"
              >
                <SnapshotTile
                  snapshot={snapshot}
                  onOpen={() => view(snapshot.id)}
                  onRemove={() => askRemove(snapshot)}
                  className="h-full"
                />
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={sentinelRef} className="w-px shrink-0" />
        </div>
      </Collapsible>
      {lightbox}
    </div>
  );
});
