import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { Meeting } from "@/types";

interface MeetingActionMenuItemsProps {
  meeting: Meeting;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  MenuItem: React.ComponentType<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }>;
  MenuSeparator: React.ComponentType<{ className?: string }>;
}

export function MeetingActionMenuItems({
  meeting,
  onArchive,
  onUnarchive,
  onDelete,
  MenuItem,
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
