import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pencil, Plus, X } from "lucide-react";
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

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Color ${color}`}
          onClick={() => onChange(color)}
          className={`h-5 w-5 rounded-full border-2 transition-[border-color,scale] duration-150 ${
            value === color
              ? "border-foreground scale-110"
              : "border-transparent hover:border-muted-foreground/40"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function LabelEditor({
  meetingId,
  meetingLabels,
  allLabels,
  onAddLabel,
  onRemoveLabel,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: {
  meetingId: string;
  meetingLabels: Label[];
  allLabels: Label[];
  onAddLabel: (meetingId: string, labelId: string) => Promise<void>;
  onRemoveLabel: (meetingId: string, labelId: string) => Promise<void>;
  onCreateLabel: (name: string, color: string) => Promise<Label>;
  onUpdateLabel: (id: string, name: string, color: string, icon: string | null) => Promise<Label>;
  onDeleteLabel: (id: string) => Promise<void>;
}) {
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Label | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Label | null>(null);
  const meetingLabelIds = new Set(meetingLabels.map((t) => t.id));

  const handleSaveEdit = async () => {
    const name = draft?.name.trim();
    if (!draft || !name) return;
    setEditError(null);
    try {
      await onUpdateLabel(draft.id, name, draft.color, draft.icon);
      setDraft(null);
    } catch (err) {
      setEditError(String(err));
    }
  };

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
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          if (!open) setDraft(null);
        }}
      >
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
            {draft ? (
              <div className="space-y-2">
                <Input
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value });
                    setEditError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setDraft(null);
                    }
                  }}
                  aria-label="Label name"
                  className="h-8 text-sm"
                  autoFocus
                />
                <ColorSwatches value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
                {editError && <p className="text-xs text-destructive">{editError}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(draft)}
                  >
                    Delete
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={!draft.name.trim()}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
            <>
            {allLabels.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {allLabels.map((label) => (
                  <label
                    key={label.id}
                    className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={meetingLabelIds.has(label.id)}
                      onCheckedChange={() => handleToggleLabel(label.id)}
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm truncate flex-1">{label.name}</span>
                    <button
                      type="button"
                      aria-label={`Edit ${label.name}`}
                      title="Edit label"
                      onClick={(e) => {
                        e.preventDefault();
                        setDraft(label);
                        setEditError(null);
                      }}
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
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
              <ColorSwatches value={newLabelColor} onChange={setNewLabelColor} />
            </div>
            </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete label?"
        description={`"${pendingDelete?.name}" will be removed from every meeting. This can't be undone.`}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await onDeleteLabel(pendingDelete.id);
          setDraft(null);
        }}
      />
    </div>
  );
}
