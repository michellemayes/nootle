import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/Toaster";
import { useHandoffApp } from "@/hooks/useHandoffApp";
import type { HandoffApp } from "@/lib/handoff";

interface Handoff {
  /** Where it opened, e.g. "the Claude app" or "ChatGPT". */
  opened: string;
  /** The whole meeting, when the link couldn't carry all of it. */
  rest: string | null;
}

/** The chosen emoji, or else the app's logo. */
export function HandoffIcon({ icon, Logo }: { icon: string; Logo: HandoffApp["Logo"] }) {
  return icon ? <span className="text-base leading-none">{icon}</span> : <Logo className="h-4 w-4" />;
}

/** Starts a conversation in the "Continue in…" app, seeded with the meeting. */
export function ContinueInButton({ meetingId }: { meetingId: string }) {
  const { name, icon, Logo } = useHandoffApp();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const { opened, rest } = await invoke<Handoff>("continue_in_app", { meetingId });
      if (rest) {
        await navigator.clipboard.writeText(rest).catch(() => {});
        toast(`Opened ${opened} with your notes. The transcript was too long for a link, so the whole meeting is on your clipboard to paste.`, { duration: 8000 });
      } else {
        toast(`Opened ${opened} with this meeting.`);
      }
    } catch (err) {
      toast(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="icon-sm" disabled={busy} onClick={open} title={`Continue in ${name}`} aria-label={`Continue in ${name}`}>
      <HandoffIcon icon={icon} Logo={Logo} />
    </Button>
  );
}
