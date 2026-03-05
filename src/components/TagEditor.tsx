import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";
import type { Tag } from "@/types";

const TAG_COLORS = [
  "#4EEABB",
  "#C084FC",
  "#E879A8",
  "#3B82F6",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#94A3B8",
];

export function TagEditor({
  meetingId,
  meetingTags,
  allTags,
  onAddTag,
  onRemoveTag,
  onCreateTag,
}: {
  meetingId: string;
  meetingTags: Tag[];
  allTags: Tag[];
  onAddTag: (meetingId: string, tagId: string) => Promise<void>;
  onRemoveTag: (meetingId: string, tagId: string) => Promise<void>;
  onCreateTag: (name: string, color: string) => Promise<Tag>;
}) {
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const meetingTagIds = new Set(meetingTags.map((t) => t.id));

  const handleToggleTag = async (tagId: string) => {
    if (meetingTagIds.has(tagId)) {
      await onRemoveTag(meetingId, tagId);
    } else {
      await onAddTag(meetingId, tagId);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await onCreateTag(name, newTagColor);
      await onAddTag(meetingId, tag.id);
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0]);
    } catch {
      // Tag name may already exist
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {meetingTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveTag(meetingId, tag.id);
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
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Tag
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</p>
            {allTags.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {allTags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={meetingTagIds.has(tag.id)}
                      onCheckedChange={() => handleToggleTag(tag.id)}
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-sm truncate">{tag.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Create new tag</p>
              <div className="flex gap-2">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTag();
                  }}
                  placeholder="Tag name"
                  className="flex-1 h-7 rounded border bg-transparent px-2 text-sm"
                />
                <button
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim()}
                  className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Add
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={`h-5 w-5 rounded-full border-2 transition-all ${
                      newTagColor === color
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
