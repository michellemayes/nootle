import { Archive, ArchiveRestore, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { Meeting, Category } from "@/types";

interface MeetingActionMenuItemsProps {
  meeting: Meeting;
  categories: Category[];
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onCategorySelect: (categoryId: string | null) => void;
  onNewCategory: () => void;
  MenuItem: React.ComponentType<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }>;
  MenuSub: React.ComponentType<{ children: React.ReactNode }>;
  MenuSubTrigger: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>;
  MenuSubContent: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>;
  MenuSeparator: React.ComponentType<{ className?: string }>;
}

export function MeetingActionMenuItems({
  meeting,
  categories,
  onArchive,
  onUnarchive,
  onDelete,
  onCategorySelect,
  onNewCategory,
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
  MenuSeparator,
}: MeetingActionMenuItemsProps) {
  const isArchived = meeting.status === "archived";

  return (
    <>
      {isArchived ? (
        <MenuItem onClick={onUnarchive}>
          <ArchiveRestore className="mr-2 h-4 w-4" />
          Unarchive
        </MenuItem>
      ) : (
        <MenuItem onClick={onArchive}>
          <Archive className="mr-2 h-4 w-4" />
          Archive
        </MenuItem>
      )}
      <MenuSub>
        <MenuSubTrigger>
          <FolderOpen className="mr-2 h-4 w-4" />
          Category
        </MenuSubTrigger>
        <MenuSubContent>
          <MenuItem onClick={() => onCategorySelect(null)}>None</MenuItem>
          {categories.map((cat) => (
            <MenuItem key={cat.id} onClick={() => onCategorySelect(cat.id)}>
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
              {meeting.category_id === cat.id && (
                <span className="ml-auto text-xs text-muted-foreground">
                  ✓
                </span>
              )}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={onNewCategory}>
            <Plus className="mr-2 h-4 w-4" />
            New category...
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuSeparator />
      <MenuItem
        onClick={onDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </MenuItem>
    </>
  );
}
