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
          <DialogTitle>Delete meeting?</DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-medium text-foreground">{meetingTitle}</span>{" "}
            and all its transcripts, summaries, insights, and audio. No takebacks — this noodle can't be uncooked.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
