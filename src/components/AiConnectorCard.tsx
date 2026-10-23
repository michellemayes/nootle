import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CopyButton } from "@/components/CopyButton";
import { useBusyAction } from "@/hooks/useBusyAction";
import type { ConnectorAccess } from "@/types";

/**
 * The AI connector: lets Claude and other cloud AI apps read the shared
 * meetings you tick for it in the Share menu, through nootle.ai's MCP server.
 * You sign in there with the connector's key, so in a team workspace everyone
 * connects to their own meetings.
 */
export function AiConnectorCard() {
  const [access, setAccess] = useState<ConnectorAccess | null>(null);
  const { busy, error, run: act } = useBusyAction();
  const [confirming, setConfirming] = useState<keyof typeof dialogs | null>(null);

  useEffect(() => {
    invoke<ConnectorAccess | null>("get_ai_connector").then(setAccess).catch(() => setAccess(null));
  }, []);

  const create = () => act(async () => setAccess(await invoke<ConnectorAccess>("create_ai_connector")));
  const turnOff = () =>
    act(async () => {
      await invoke("delete_ai_connector");
      setAccess(null);
    });
  const dialogs = {
    reset: {
      title: "Reset the connector key?",
      description: "AI apps signed in with the current key lose access. Sign in again with the new one.",
      confirmLabel: "Reset key",
      onConfirm: create,
    },
    off: {
      title: "Turn off the AI connector?",
      description: "AI apps signed in with your key lose access to your shared meetings. The share links themselves keep working.",
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
        {access ? (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium">Server URL</p>
              <div className="flex items-center gap-1">
                <Input readOnly value={access.server_url} className="h-8 text-xs" onFocus={(e) => e.target.select()} aria-label="Server URL" />
                <CopyButton text={access.server_url} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Your key</p>
              <div className="flex items-center gap-2">
                <Input readOnly type="password" value={access.key} className="h-8 text-xs" aria-label="Connector key" />
                <CopyButton text={access.key} variant="button" label="Copy key" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Add the server URL as a custom connector (in Claude: Settings → Connectors → Add custom connector), then
              paste your key when it asks you to sign in. On a Claude Team or Enterprise plan, an owner adds the
              connector once and each member signs in with their own key. Keep the key private: it unlocks the
              meetings it lists. nootle.ai uses it only while answering your AI, and never stores it.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nootle makes a private key for nootle.ai's MCP server, which you paste when your AI app asks you to sign in.
            Notes stay encrypted on nootle.ai, and only the key unlocks them.
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {access ? (
            <>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => setConfirming("off")}>
                Turn off
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming("reset")}>
                {busy && <RotateCw className="h-3 w-3 animate-spin" />}
                Reset key
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={create}>
              {busy && <RotateCw className="h-3 w-3 animate-spin" />}
              Create connector key
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
