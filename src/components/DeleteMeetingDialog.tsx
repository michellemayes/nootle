import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  onConfirm: () => void;
}

export function DeleteMeetingDialog({
  open,
  onOpenChange,
  meetingTitle,
  onConfirm,
}: DeleteMeetingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete meeting</DialogTitle>
          <DialogDescription>
            Are you sure? This will permanently delete{" "}
            <span className="font-medium text-foreground">{meetingTitle}</span>{" "}
            and all its transcripts, summaries, insights, and recording audio.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
