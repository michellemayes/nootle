import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { labelTextColor } from "@/lib/utils";
import type { Label } from "@/types";

// Hex, because the backend only accepts #rrggbb label colors.
const LABEL_COLORS = [
  "#00cf99",
  "#a36df0",
  "#e96cad",
  "#337aef",
  "#f47600",
  "#d0ab00",
  "#00af58",
  "#88909c",
];

export function LabelEditor({
  meetingId,
  meetingLabels,
  allLabels,
  onAddLabel,
  onRemoveLabel,
  onCreateLabel,
}: {
  meetingId: string;
  meetingLabels: Label[];
  allLabels: Label[];
  onAddLabel: (meetingId: string, labelId: string) => Promise<void>;
  onRemoveLabel: (meetingId: string, labelId: string) => Promise<void>;
  onCreateLabel: (name: string, color: string) => Promise<Label>;
}) {
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const meetingLabelIds = new Set(meetingLabels.map((t) => t.id));

  const handleToggleLabel = async (labelId: string) => {
    if (meetingLabelIds.has(labelId)) {
      await onRemoveLabel(meetingId, labelId);
    } else {
      await onAddLabel(meetingId, labelId);
    }
  };

  const handleCreateLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    setCreateError(null);
    try {
      const label = await onCreateLabel(name, newLabelColor);
      await onAddLabel(meetingId, label.id);
      setNewLabelName("");
      setNewLabelColor(LABEL_COLORS[0]);
    } catch (err) {
      setCreateError(String(err));
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {meetingLabels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium"
          style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
        >
          {label.name}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveLabel(meetingId, label.id);
            }}
            className="rounded-full p-0.5 hover:bg-black/20 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Label
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Labels</p>
            {allLabels.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {allLabels.map((label) => (
                  <label
                    key={label.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={meetingLabelIds.has(label.id)}
                      onCheckedChange={() => handleToggleLabel(label.id)}
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm truncate">{label.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Create new label</p>
              <div className="flex gap-2">
                <Input
                  value={newLabelName}
                  onChange={(e) => {
                    setNewLabelName(e.target.value);
                    setCreateError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateLabel();
                  }}
                  placeholder="Label name"
                  aria-label="New label name"
                  className="h-8 flex-1 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleCreateLabel}
                  disabled={!newLabelName.trim()}
                >
                  Add
                </Button>
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
              <div className="flex gap-1.5 flex-wrap">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewLabelColor(color)}
                    className={`h-5 w-5 rounded-full border-2 transition-[border-color,scale] duration-150 ${
                      newLabelColor === color
                        ? "border-foreground scale-110"
                        : "border-transparent hover:border-muted-foreground/40"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
