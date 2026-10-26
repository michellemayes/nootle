import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronDown, ExternalLink, Link2, Lock, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CopyButton } from "@/components/CopyButton";
import { formatDate } from "@/lib/utils";
import { useBusyAction } from "@/hooks/useBusyAction";
import type { ConnectorAccess, Meeting, MeetingShare } from "@/types";

/**
 * Creates, refreshes, or revokes a link to the meeting's notes on nootle.ai.
 * The note is encrypted on this Mac and only the link holds the key.
 */
export function ShareMenu({ meeting }: { meeting: Meeting }) {
  const [share, setShare] = useState<MeetingShare | null>(null);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [aiAccess, setAiAccess] = useState(false);
  const [hasConnector, setHasConnector] = useState(false);
  const { busy, error, setError, run: act } = useBusyAction();

  useEffect(() => {
    invoke<MeetingShare | null>("get_meeting_share", { meetingId: meeting.id })
      .then((s) => {
        setShare(s);
        setIncludeTranscript(s?.include_transcript ?? false);
        setAiAccess(s?.ai_access ?? false);
      })
      .catch(() => setShare(null));
  }, [meeting.id]);


  const publish = () =>
    act(async () => {
      setShare(await invoke<MeetingShare>("share_meeting", { meetingId: meeting.id, includeTranscript, aiAccess }));
    });

  const revoke = () =>
    act(async () => {
      await invoke("unshare_meeting", { meetingId: meeting.id });
      setShare(null);
    });

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        setError(null);
        invoke<ConnectorAccess | null>("get_ai_connector").then((access) => setHasConnector(access !== null)).catch(() => {});
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <Link2 className={`h-3 w-3 ${share ? "text-success-foreground" : ""}`} />
          <span className="@max-md/main:sr-only">{share ? "Shared" : "Share"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Share link</p>
          <Badge variant="success">
            <Lock />
            Private and end-to-end encrypted
          </Badge>
          <p className="text-xs text-muted-foreground">
            Anyone with the link can read this meeting's summaries, action items, and notes. They're
            encrypted on your Mac and the link holds the key, so nootle.ai can't read them.
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

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={aiAccess} onCheckedChange={(v) => setAiAccess(v === true)} />
            Let AI connectors read this
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            {hasConnector ? (
              "AI apps you've connected can list and read it. nootle.ai opens it only while answering them."
            ) : (
              <>
                Set up the connector in{" "}
                <Link to="/settings?tab=integrations" className="underline">
                  Settings → Integrations
                </Link>{" "}
                to let Claude and other AI apps read it.
              </>
            )}
          </p>
        </div>

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
