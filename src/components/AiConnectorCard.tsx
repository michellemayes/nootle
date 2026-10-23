import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CopyButton } from "@/components/CopyButton";
import { useBusyAction } from "@/hooks/useBusyAction";

/**
 * The AI connector: a private nootle.ai MCP link that lets Claude and other
 * cloud AI apps read the shared meetings you tick for it in the Share menu.
 */
export function AiConnectorCard() {
  const [url, setUrl] = useState<string | null>(null);
  const { busy, error, run: act } = useBusyAction();
  const [confirming, setConfirming] = useState<keyof typeof dialogs | null>(null);

  useEffect(() => {
    invoke<string | null>("get_ai_connector").then(setUrl).catch(() => setUrl(null));
  }, []);

  const create = () => act(async () => setUrl(await invoke<string>("create_ai_connector")));
  const turnOff = () =>
    act(async () => {
      await invoke("delete_ai_connector");
      setUrl(null);
    });
  const dialogs = {
    reset: {
      title: "Reset the connector link?",
      description: "The current link stops working. Paste the new one into your AI apps.",
      confirmLabel: "Reset link",
      onConfirm: create,
    },
    off: {
      title: "Turn off the AI connector?",
      description: "AI apps using the link lose access to your shared meetings. The share links themselves keep working.",
      confirmLabel: "Turn off",
      onConfirm: turnOff,
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI connector</CardTitle>
        <CardDescription>
          Let Claude, ChatGPT and other cloud AI apps read meetings you've shared. Only shares you tick{" "}
          <strong>Let AI connectors read this</strong> on are listed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {url ? (
          <>
            <div className="flex items-center gap-1">
              <Input readOnly value={url} className="h-8 text-xs" onFocus={(e) => e.target.select()} aria-label="Connector link" />
              <CopyButton text={url} />
            </div>
            <p className="text-xs text-muted-foreground">
              Add it as a custom connector (in Claude: Settings → Connectors → Add custom connector). Keep it private:
              the link holds the key to the meetings it lists. nootle.ai unlocks them only while answering your AI,
              and never stores the key.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nootle makes a private link to nootle.ai's MCP server for you to add to your AI app. Notes stay encrypted on
            nootle.ai, and the link holds the key.
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {url ? (
            <>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => setConfirming("off")}>
                Turn off
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming("reset")}>
                {busy && <RotateCw className="h-3 w-3 animate-spin" />}
                Reset link
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={create}>
              {busy && <RotateCw className="h-3 w-3 animate-spin" />}
              Create connector link
            </Button>
          )}
        </div>
      </CardContent>
      {confirming && (
        <ConfirmDialog open onOpenChange={(open) => !open && setConfirming(null)} {...dialogs[confirming]} />
      )}
    </Card>
  );
}
