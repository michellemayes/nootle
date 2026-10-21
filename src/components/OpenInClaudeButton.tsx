import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { ClaudeIcon } from "@/components/ClaudeIcon";
import { toast } from "@/components/Toaster";

interface ClaudeHandoff {
  desktop: boolean;
  /** The whole meeting, when the link couldn't carry all of it. */
  rest: string | null;
}

/** Starts a Claude conversation (desktop app or claude.ai) seeded with the meeting. */
export function OpenInClaudeButton({ meetingId }: { meetingId: string }) {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const { desktop, rest } = await invoke<ClaudeHandoff>("open_in_claude", { meetingId });
      const where = desktop ? "the Claude app" : "claude.ai";
      if (rest) {
        await navigator.clipboard.writeText(rest).catch(() => {});
        toast(`Opened ${where} with your notes. The transcript was too long for a link, so the whole meeting is on your clipboard to paste.`, { duration: 8000 });
      } else {
        toast(`Opened ${where} with this meeting.`);
      }
    } catch (err) {
      toast(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="icon-sm" disabled={busy} onClick={open} title="Continue in Claude" aria-label="Continue in Claude">
      <ClaudeIcon className="h-4 w-4" />
    </Button>
  );
}
