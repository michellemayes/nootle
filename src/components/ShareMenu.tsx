import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronDown, ExternalLink, Link2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CopyButton } from "@/components/CopyButton";
import { formatDate } from "@/lib/utils";
import type { Meeting, MeetingShare } from "@/types";

/**
 * Creates, refreshes, or revokes a public link to the meeting's notes. The
 * link is a secret gist in the user's own GitHub account.
 */
export function ShareMenu({ meeting }: { meeting: Meeting }) {
  const [share, setShare] = useState<MeetingShare | null>(null);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<MeetingShare | null>("get_meeting_share", { meetingId: meeting.id })
      .then((s) => {
        setShare(s);
        setIncludeTranscript(s?.include_transcript ?? false);
      })
      .catch(() => setShare(null));
  }, [meeting.id]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const publish = () =>
    act(async () => {
      setShare(await invoke<MeetingShare>("share_meeting", { meetingId: meeting.id, includeTranscript }));
    });

  const revoke = () =>
    act(async () => {
      await invoke("unshare_meeting", { meetingId: meeting.id });
      setShare(null);
    });

  return (
    <Popover onOpenChange={(open) => open && setError(null)}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <Link2 className={`h-3 w-3 ${share ? "text-success-foreground" : ""}`} />
          {share ? "Shared" : "Share"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Public link</p>
          <p className="text-xs text-muted-foreground">
            Anyone with the link can read this meeting's summaries, action items, and notes. It's a
            secret gist in your GitHub account, so it's not listed or searchable.
          </p>
        </div>

        {share && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Input readOnly value={share.url} className="h-8 text-xs" onFocus={(e) => e.target.select()} />
              <CopyButton text={share.url} />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Open link" onClick={() => openUrl(share.url)}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Updated {formatDate(share.updated_at, "long")}. Edits here don't change the link until you update it.
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeTranscript} onCheckedChange={(v) => setIncludeTranscript(v === true)} />
          Include the transcript
        </label>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {share && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={revoke}>
              Stop sharing
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={publish}>
            {busy && <RotateCw className="h-3 w-3 animate-spin" />}
            {share ? "Update link" : "Create link"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
