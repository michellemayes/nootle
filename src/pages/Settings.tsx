import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useLLM } from "@/hooks/useLLM";

const PROVIDERS = ["openai", "anthropic", "google", "groq", "ollama"];

const MCP_CONFIG = `{
  "mcpServers": {
    "nootle": {
      "command": "/path/to/nootle",
      "args": ["--mcp"]
    }
  }
}`;

function ApiKeyRow({ provider, isStored, onSave, onDelete }: {
  provider: string;
  isStored: boolean;
  onSave: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      await onSave(keyValue);
      setKeyValue("");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex items-center gap-2 w-32 shrink-0">
        <span className="text-sm font-medium capitalize">{provider}</span>
        {isStored && (
          <Badge variant="secondary" className="text-[10px]">
            Saved
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            type={showKey ? "text" : "password"}
            placeholder={`Enter ${provider} API key`}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowKey(!showKey)}
            title={showKey ? "Hide" : "Show"}
          >
            {showKey ? "\uD83D\uDE48" : "\uD83D\uDC41"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !keyValue.trim()}>
            {saving ? "..." : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setKeyValue("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-2">
          {isStored ? (
            <>
              <span className="flex-1 text-sm text-muted-foreground font-mono">
                {"*".repeat(24)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                Delete
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-muted-foreground">
                Not configured
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Add Key
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { storedProviders, storeKey, deleteKey } = useApiKeys();
  const { providers: llmProviders } = useLLM();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Merge known providers with any discovered from LLM
  const allProviders = Array.from(
    new Set([...PROVIDERS, ...llmProviders]),
  );

  return (
    <div className="flex flex-1 flex-col gap-8 p-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure API keys and application settings
        </p>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Configure API keys for LLM providers. Keys are stored securely in the
            macOS Keychain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {allProviders.map((provider) => (
              <ApiKeyRow
                key={provider}
                provider={provider}
                isStored={storedProviders.includes(provider)}
                onSave={(key) => storeKey(provider, key)}
                onDelete={() => deleteKey(provider)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>
            Nootle v0.1.0 — Meeting recorder and summarizer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2">MCP Server Configuration</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Add this to your MCP client configuration to use Nootle as an MCP
              server:
            </p>
            <div className="relative">
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
                {MCP_CONFIG}
              </pre>
              <Button
                variant="secondary"
                size="xs"
                className="absolute top-2 right-2"
                onClick={handleCopy}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
