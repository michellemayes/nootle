import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingCard, FloatingCardRow } from "@/components/FloatingCard";
import type { DetectedMeeting } from "@/types";

/** Offers to record a meeting Nootle just noticed. */
export function MeetingDetectedBanner({
  meeting,
  onStart,
  onDismiss,
}: {
  meeting: DetectedMeeting | null;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingCard show={meeting !== null} onDismiss={onDismiss}>
      {meeting && (
        <FloatingCardRow
          icon={<Mic className="h-4 w-4 text-primary" />}
          title="Meeting detected"
          detail={`${meeting.display_name} is using your microphone.`}
        >
          <Button size="sm" className="w-full" onClick={onStart}>
            Start recording
          </Button>
        </FloatingCardRow>
      )}
    </FloatingCard>
  );
}
