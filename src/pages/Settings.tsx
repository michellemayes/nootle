import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useLLM } from "@/hooks/useLLM";
import { useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
import { useModelDownload } from "@/hooks/useModelDownload";
import { useTheme } from "@/hooks/useTheme";
import { AccentColorPicker } from "@/components/AccentColorPicker";
import { EyeOff, Eye, Moon, Sun } from "lucide-react";

const PROVIDERS = ["openai", "anthropic", "google", "groq", "ollama"];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

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
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

function LinearDefaults() {
  const { teams, loading: teamsLoading, fetchTeams } = useLinearTeams();
  const { defaultTeamId, defaultProjectId, saveDefaultTeam, saveDefaultProject } =
    useLinearSettings();
  const { projects, loading: projectsLoading } = useLinearProjects(defaultTeamId);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Defaults</p>
      <div className="flex items-center gap-3">
        <label className="w-20 shrink-0 text-sm text-muted-foreground">Team</label>
        <select
          value={defaultTeamId ?? ""}
          onChange={(e) => saveDefaultTeam(e.target.value)}
          disabled={teamsLoading}
          className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">Select team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.key})
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <label className="w-20 shrink-0 text-sm text-muted-foreground">Project</label>
        <select
          value={defaultProjectId ?? ""}
          onChange={(e) => saveDefaultProject(e.target.value)}
          disabled={projectsLoading || !defaultTeamId}
          className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">None (optional)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { storedProviders, storeKey, deleteKey } = useApiKeys();
  const { providers: llmProviders } = useLLM();
  const { theme, toggleTheme } = useTheme();
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
    <ScrollArea className="flex-1 min-h-0">
      <div className="flex flex-col gap-8 p-8 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure API keys and application settings
          </p>
        </div>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose your preferred color scheme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  {theme === "light" ? "Light mode" : "Dark mode"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                {theme === "light" ? <><Moon className="h-4 w-4" /> Dark</> : <><Sun className="h-4 w-4" /> Light</>}
              </Button>
            </div>
            <AccentColorPicker />
          </CardContent>
        </Card>

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

        {/* Linear */}
        <Card>
          <CardHeader>
            <CardTitle>Linear</CardTitle>
            <CardDescription>
              Connect to Linear to create tickets from meeting summaries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ApiKeyRow
              provider="linear"
              isStored={storedProviders.includes("linear")}
              onSave={(key) => storeKey("linear", key)}
              onDelete={() => deleteKey("linear")}
            />
            {storedProviders.includes("linear") && (
              <LinearDefaults />
            )}
          </CardContent>
        </Card>

        {/* AI Models */}
        <ModelManagementCard />

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>
              Nootle v0.1.0 — Your meetings, transcribed and summarized with a twist
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
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={copied ? "check" : "copy"}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: copied ? [1, 1.2, 1] : 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      {copied ? "\u2713 Copied" : "Copy"}
                    </motion.span>
                  </AnimatePresence>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function ModelManagementCard() {
  const {
    registry,
    diskStatus,
    progress,
    downloadModel,
    cancelDownload,
    deleteModel,
  } = useModelDownload();

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const isDownloading =
    progress !== null &&
    typeof progress.state === "string" &&
    (progress.state === "downloading" || progress.state === "verifying");

  const getSelectedVariant = (modelId: string): string => {
    if (selectedVariants[modelId]) return selectedVariants[modelId];
    const model = registry.find((m) => m.id === modelId);
    if (!model) return "default";
    if (model.variants.length === 1) return model.variants[0].id;
    const int8 = model.variants.find((v) => v.id === "int8");
    return int8 ? "int8" : model.variants[0].id;
  };

  const handleDelete = async (modelId: string) => {
    setDeleting(modelId);
    try {
      await deleteModel(modelId);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Models</CardTitle>
        <CardDescription>
          Manage local AI models for transcription and speaker identification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {diskStatus.map((model) => {
            const regModel = registry.find((r) => r.id === model.model_id);
            const isThisModelDownloading =
              isDownloading && progress?.model_id === model.model_id;

            return (
              <div key={model.model_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        {model.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          model.downloaded
                            ? "bg-green-500/15 text-green-500 text-[10px]"
                            : "text-[10px]"
                        }
                      >
                        {model.downloaded ? "Downloaded" : "Not Downloaded"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {model.description}
                    </p>

                    {model.downloaded && model.size_on_disk > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Size on disk: {formatBytes(model.size_on_disk)}
                      </p>
                    )}

                    {/* Variant picker for not-downloaded models with multiple variants */}
                    {!model.downloaded &&
                      regModel &&
                      regModel.variants.length > 1 && (
                        <div className="flex gap-3 mt-2">
                          {regModel.variants.map((variant) => (
                            <label
                              key={variant.id}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={`settings-variant-${model.model_id}`}
                                checked={
                                  getSelectedVariant(model.model_id) ===
                                  variant.id
                                }
                                onChange={() =>
                                  setSelectedVariants((prev) => ({
                                    ...prev,
                                    [model.model_id]: variant.id,
                                  }))
                                }
                                className="accent-primary"
                              />
                              <span className="text-xs text-foreground">
                                {variant.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({formatBytes(variant.total_size_bytes)})
                              </span>
                            </label>
                          ))}
                        </div>
                      )}

                    {/* Progress bar for this model */}
                    {isThisModelDownloading && progress && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>
                            {typeof progress.state === "string" &&
                            progress.state === "verifying"
                              ? "Verifying..."
                              : `Downloading ${progress.current_file}`}
                          </span>
                          <span>
                            {Math.round(progress.overall_percent * 100)}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{
                              width: `${Math.round(progress.overall_percent * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {isThisModelDownloading ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelDownload}
                      >
                        Cancel
                      </Button>
                    ) : model.downloaded ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(model.model_id)}
                        disabled={deleting === model.model_id}
                      >
                        {deleting === model.model_id ? "Deleting..." : "Delete"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadModel(
                            model.model_id,
                            getSelectedVariant(model.model_id)
                          )
                        }
                        disabled={isDownloading}
                      >
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
