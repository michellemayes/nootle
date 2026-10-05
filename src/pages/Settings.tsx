import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSearchParams } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible } from "@/components/Collapsible";
import { PageHeader } from "@/components/PageHeader";
import { McpSetup } from "@/components/McpSetup";
import { DictionaryManager } from "@/components/DictionaryManager";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { INSIGHT_ICONS } from "@/lib/insightIcons";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useLLM } from "@/hooks/useLLM";
import { useModelDownload, MODELS_REQUIRING_AUTH } from "@/hooks/useModelDownload";
import { useTheme } from "@/hooks/useTheme";

import { useInsightTypes } from "@/hooks/useInsightTypes";
import { useAppVersion } from "@/hooks/useAppVersion";
import { checkForUpdates, useUpdater } from "@/hooks/useUpdater";
import { AccentColorPicker, BackgroundThemePicker } from "@/components/ThemePickers";
import { VariantPicker, DownloadProgressBar } from "@/components/ModelDownload";
import { EyeOff, Eye, Moon, Sun, Pencil, Trash2, Plus, Link, Unlink, LogIn, ExternalLink, Terminal, Loader2, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatBytes } from "@/lib/utils";
import { useIntegrations } from "@/hooks/useIntegrations";
import { INTEGRATION_TYPES } from "@/lib/integrations";

const PROVIDERS = ["openai", "anthropic", "google", "groq", "openrouter", "bedrock", "codex"];

const CLI_PROVIDERS = ["claude-agent", "codex-cli"] as const;

const AUTO_DETECTED_PROVIDERS = ["ollama", ...CLI_PROVIDERS] as const;

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  openrouter: "OpenRouter",
  bedrock: "AWS Bedrock",
  ollama: "Ollama (local)",
  codex: "Codex (API key)",
  "codex-cli": "Codex CLI (ChatGPT subscription)",
  "claude-agent": "Claude CLI (claude -p)",
  linear: "Linear",
  asana: "Asana",
  obsidian: "Obsidian",
};

const PROVIDER_KEY_PLACEHOLDERS: Record<string, string> = {
  bedrock: "us-east-1:ABSK_yourkey…  (region:key)",
  codex: "sk-… (OpenAI API key with Codex access)",
};

const AUTO_DETECTED_HINTS: Record<string, { detected: string; notDetected: string }> = {
  ollama: {
    detected: "Reachable at 127.0.0.1:11434 — no API key needed.",
    notDetected: "Not detected. Start Ollama locally (e.g. `ollama serve`), then restart Nootle.",
  },
  "claude-agent": {
    detected: "Using `claude` on your PATH — no API key needed.",
    notDetected: "Not detected. Install the Claude Code CLI and sign in with your Claude subscription, then restart Nootle.",
  },
  "codex-cli": {
    detected: "Using `codex` on your PATH — no API key needed.",
    notDetected: "Not detected. Install the Codex CLI and sign in with your ChatGPT subscription, then restart Nootle.",
  },
};

function IntegrationCard({ intType, connectedIntegration, canSignIn, quickConnect, onConnect, onSignIn, onCancelSignIn, onDisconnect }: {
  intType: typeof INTEGRATION_TYPES[number];
  connectedIntegration: { id: string; name: string } | undefined;
  canSignIn: boolean;
  /** A no-token way to connect using a sign-in already on this Mac. */
  quickConnect?: { label: string; connect: () => Promise<unknown> };
  onConnect: (type: string, name: string, creds: Record<string, string>) => Promise<void>;
  onSignIn: (type: string) => Promise<unknown>;
  onCancelSignIn: () => Promise<unknown>;
  onDisconnect: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [speakerRows, setSpeakerRows] = useState<{ label: string; name: string }[]>([]);
  const isConnected = !!connectedIntegration;

  const updateSpeakerRow = (i: number, patch: Partial<{ label: string; name: string }>) =>
    setSpeakerRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const resetForm = () => {
    setFields({});
    setSpeakerRows([]);
    setExpanded(false);
  };

  const handleSignIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      await onSignIn(intType.type);
      setExpanded(false);
    } catch (err) {
      setSignInError(String(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleQuickConnect = async () => {
    if (!quickConnect) return;
    setSignInError(null);
    setSaving(true);
    try {
      await quickConnect.connect();
      setExpanded(false);
    } catch (err) {
      setSignInError(String(err));
    } finally {
      setSaving(false);
    }
  };
  const isEmail = intType.type === "email";
  const isObsidian = intType.type === "obsidian";

  const handleConnect = async () => {
    if (isEmail) {
      setSaving(true);
      try {
        await onConnect("email", "Email", {});
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!expanded) {
      setExpanded(true);
      return;
    }

    const hasAllRequired = intType.fields.every((f) => fields[f.key]?.trim());
    if (!hasAllRequired) return;

    let creds: Record<string, string> = fields;
    if (isObsidian) {
      const speakerMap: Record<string, string> = {};
      speakerRows.forEach((row) => {
        const label = row.label.trim();
        const name = row.name.trim();
        if (label && name) {
          speakerMap[label] = name;
        }
      });
      creds = {
        vault_path: fields.vault_path,
        speaker_map: JSON.stringify(speakerMap),
      };
    }

    setSaving(true);
    try {
      await onConnect(intType.type, intType.name, creds);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectedIntegration) return;
    setSaving(true);
    try {
      await onDisconnect(connectedIntegration.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium truncate">{connectedIntegration?.name ?? intType.name}</span>
          {isConnected ? (
            <Badge variant="success" size="sm">Connected</Badge>
          ) : (
            <Badge variant="secondary" size="sm">Not connected</Badge>
          )}
        </div>
        {isConnected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={saving}>
            <Unlink />
            Disconnect
          </Button>
        ) : signingIn ? (
          <>
            <span className="text-xs text-muted-foreground">Finish signing in in your browser…</span>
            <Button variant="ghost" size="sm" onClick={() => onCancelSignIn()}>
              Cancel
            </Button>
          </>
        ) : canSignIn ? (
          <Button variant="outline" size="sm" onClick={handleSignIn}>
            <LogIn />
            Sign in with {intType.name}
          </Button>
        ) : quickConnect ? (
          <Button variant="outline" size="sm" onClick={handleQuickConnect} disabled={saving}>
            <Terminal />
            {quickConnect.label}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleConnect} disabled={saving}>
            <Link />
            {isEmail ? "Enable" : "Connect"}
          </Button>
        )}
      </div>
      {!isConnected && signInError && (
        <p className="mt-2 text-xs text-destructive">{signInError}</p>
      )}
      {!isConnected && (canSignIn || quickConnect) && !signingIn && !expanded && (
        <Button
          variant="link"
          size="xs"
          className="mt-1 px-0 text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          Use a token instead
        </Button>
      )}
      <Collapsible open={expanded && !isConnected && intType.fields.length > 0}>
        <div className="mt-3 space-y-2">
              {"tokenUrl" in intType && (
                <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground flex-1">{intType.tokenHint}</p>
                  <Button variant="outline" size="xs" onClick={() => openUrl(intType.tokenUrl)}>
                    <ExternalLink />
                    Get a token
                  </Button>
                </div>
              )}
              {intType.fields.map((field) => (
                <div key={field.key} className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-24 shrink-0">{field.label}</label>
                  {field.key === "vault_path" ? (
                    <div className="flex gap-2 flex-1">
                      <Input
                        readOnly
                        placeholder={field.placeholder}
                        value={fields[field.key] ?? ""}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const selected = await open({ directory: true, title: "Select Obsidian vault" });
                          if (selected) {
                            setFields((prev) => ({ ...prev, [field.key]: selected as string }));
                          }
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type="password"
                      placeholder={field.placeholder}
                      value={fields[field.key] ?? ""}
                      onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="flex-1"
                    />
                  )}
                </div>
              ))}
              {isObsidian && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-medium text-muted-foreground">People links</label>
                  <p className="text-xs text-muted-foreground">Turn names that appear in summaries and action items into [[wikilinks]] to your people notes. Transcript labels like "Speaker 1" are assigned per meeting, so they can't be mapped here.</p>
                  {speakerRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Mike"
                        value={row.label}
                        onChange={(e) => updateSpeakerRow(i, { label: e.target.value })}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input
                        placeholder="Mike Ross"
                        value={row.name}
                        onChange={(e) => updateSpeakerRow(i, { name: e.target.value })}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="icon-sm" aria-label="Remove person" onClick={() => setSpeakerRows((prev) => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSpeakerRows((prev) => [...prev, { label: "", name: "" }])}>
                    <Plus /> Add person
                  </Button>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={saving || !intType.fields.every((f) => fields[f.key]?.trim())}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
        </div>
      </Collapsible>
    </div>
  );
}

function IntegrationsManager() {
  const { integrations, loading, signIn, cancelSignIn, githubCliAvailable, connectGithubCli, createIntegration, deleteIntegration } = useIntegrations();

  const handleConnect = async (type: string, name: string, creds: Record<string, string>) => {
    await createIntegration(type, name, JSON.stringify(creds));
  };

  const handleDisconnect = async (id: string) => {
    await deleteIntegration(id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connect services for post-meeting workflows. AI provider keys live under API keys.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState message={LOADING_COPY.integrations} layout="inline" />
        ) : (
          <div className="divide-y">
            {INTEGRATION_TYPES.map((intType) => (
              <IntegrationCard
                key={intType.type}
                intType={intType}
                connectedIntegration={integrations.find((i) => i.integration_type === intType.type)}
                canSignIn={"signIn" in intType}
                quickConnect={intType.type === "github" && githubCliAvailable
                  ? { label: "Use GitHub CLI sign-in", connect: connectGithubCli }
                  : undefined}
                onConnect={handleConnect}
                onSignIn={signIn}
                onCancelSignIn={cancelSignIn}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const displayName = PROVIDER_DISPLAY_NAMES[provider] ?? provider;

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
        <span className="text-sm font-medium">{displayName}</span>
        {isStored && <Badge variant="success" size="sm">Saved</Badge>}
      </div>

      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            type={showKey ? "text" : "password"}
            placeholder={PROVIDER_KEY_PLACEHOLDERS[provider] ?? `${displayName} API key`}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowKey(!showKey)}
            title={showKey ? "Hide key" : "Show key"}
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !keyValue.trim()}>
            {saving ? "Saving…" : "Save"}
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
                onClick={() => setConfirmingDelete(true)}
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
                Add key
              </Button>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete API key?"
        description={`Nootle will stop using ${displayName} until you add a new key.`}
        onConfirm={onDelete}
      />
    </div>
  );
}

function AutoDetectedProviderRow({ provider, detected }: { provider: string; detected: boolean }) {
  const hint = AUTO_DETECTED_HINTS[provider];
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex items-center gap-2 w-48 shrink-0">
        <span className="text-sm font-medium">{PROVIDER_DISPLAY_NAMES[provider] ?? provider}</span>
        {detected && <Badge variant="success" size="sm">Detected</Badge>}
      </div>
      <div className="flex-1 text-sm text-muted-foreground">
        {detected ? hint?.detected : hint?.notDetected}
      </div>
    </div>
  );
}

function InsightTypesManager() {
  const { types, createInsightType, updateInsightType, deleteInsightType } = useInsightTypes();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editHasAction, setEditHasAction] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newIcon, setNewIcon] = useState("lightbulb");
  const [newHasAction, setNewHasAction] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<typeof types[0] | null>(null);

  const startEditing = (t: typeof types[0]) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDesc(t.description ?? "");
    setEditPrompt(t.extraction_prompt);
    setEditIcon(t.icon);
    setEditHasAction(t.has_action_fields);
  };

  const handleSaveEdit = async (id: string) => {
    await updateInsightType(
      id,
      editName,
      editDesc || null,
      editPrompt,
      editIcon,
      editHasAction,
    );
    setEditingId(null);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim() || !newPrompt.trim()) return;
    await createInsightType(newName, newSlug, newDesc || null, newPrompt, newIcon, newHasAction);
    setAdding(false);
    setNewName("");
    setNewSlug("");
    setNewDesc("");
    setNewPrompt("");
    setNewIcon("lightbulb");
    setNewHasAction(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insight types</CardTitle>
        <CardDescription>
          What Nootle extracts from meetings, and the prompt used for each.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {types.map((t) => (
          <div key={t.id} className="border rounded-lg p-4 space-y-3">
            {editingId === t.id ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 flex-1"
                    placeholder="Name"
                  />
                  <Select
                    size="sm"
                    containerClassName="w-40"
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    aria-label="Icon"
                  >
                    {INSIGHT_ICONS.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-8"
                  placeholder="Description"
                />
                <Textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  className="min-h-20"
                  placeholder="Extraction prompt"
                />
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={editHasAction}
                    onCheckedChange={(checked) => setEditHasAction(checked === true)}
                  />
                  Has action fields (assignee, due date)
                </label>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSaveEdit(t.id)}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{t.name}</span>
                    <Badge variant="secondary" size="sm">{t.slug}</Badge>
                    {t.is_builtin && <Badge variant="outline" size="sm">Built-in</Badge>}
                    {t.has_action_fields && <Badge variant="outline" size="sm">Action fields</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => startEditing(t)}
                      title="Edit"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!t.is_builtin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(t)}
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Extraction prompt
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                    {t.extraction_prompt}
                  </pre>
                </details>
              </>
            )}
          </div>
        ))}

        {adding ? (
          <div className="border rounded-lg p-4 space-y-3 border-dashed">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 flex-1"
                placeholder="Name (e.g. Risk)"
              />
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                className="h-8 w-40"
                placeholder="Slug (e.g. risk)"
              />
              <Select
                size="sm"
                containerClassName="w-40"
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                aria-label="Icon"
              >
                {INSIGHT_ICONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="h-8"
              placeholder="Description (optional)"
            />
            <Textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="min-h-20"
              placeholder="Extraction prompt — tell the LLM how to identify this type"
            />
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={newHasAction}
                onCheckedChange={(checked) => setNewHasAction(checked === true)}
              />
              Has action fields (assignee, due date)
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || !newSlug.trim() || !newPrompt.trim()}>
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> New insight type
          </Button>
        )}
      </CardContent>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete insight type?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>{" "}
            will be permanently deleted and no longer extracted from new meetings.
          </>
        }
        onConfirm={async () => {
          if (deleteTarget) await deleteInsightType(deleteTarget.id);
        }}
      />
    </Card>
  );
}


export function SettingsPage() {
  const { storedProviders, storeKey, deleteKey } = useApiKeys();
  const { providers: llmProviders } = useLLM();
  const { theme, toggleTheme } = useTheme();
  const version = useAppVersion();
  const [searchParams] = useSearchParams();
  const [denoiseEnabled, setDenoiseEnabled] = useState(true);
  const [detectionEnabled, setDetectionEnabled] = useState(true);
  const [remoteControlEnabled, setRemoteControlEnabled] = useState(false);

  useEffect(() => {
    invoke<string | null>("get_app_setting", { key: "denoise_enabled" })
      .then((val) => setDenoiseEnabled(val !== "false"))
      .catch(() => {});
    invoke<string | null>("get_app_setting", { key: "detection_enabled" })
      .then((val) => setDetectionEnabled(val !== "false"))
      .catch(() => {});
    invoke<string | null>("get_app_setting", { key: "remote_control_enabled" })
      .then((val) => setRemoteControlEnabled(val === "true"))
      .catch(() => {});
  }, []);

  const toggleDenoise = async (enabled: boolean) => {
    setDenoiseEnabled(enabled);
    await invoke("set_app_setting", {
      key: "denoise_enabled",
      value: String(enabled),
    });
  };

  const toggleDetection = async (enabled: boolean) => {
    setDetectionEnabled(enabled);
    await invoke("set_app_setting", {
      key: "detection_enabled",
      value: String(enabled),
    });
  };

  const toggleRemoteControl = async (enabled: boolean) => {
    setRemoteControlEnabled(enabled);
    await invoke("set_app_setting", {
      key: "remote_control_enabled",
      value: String(enabled),
    });
  };

  // Exclude auto-detected providers — they're rendered in their own card below
  // since they don't take API keys.
  const autoDetectedSet = new Set<string>(AUTO_DETECTED_PROVIDERS);
  const allProviders = Array.from(
    new Set([...PROVIDERS, ...llmProviders]),
  ).filter((p) => !autoDetectedSet.has(p));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Settings"
        description="Preferences, AI providers, integrations, and local models"
      />

      <Tabs defaultValue={searchParams.get("tab") ?? "general"} className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b px-6 py-4">
          <TabsList className="h-10">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="api-keys">API keys</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="dictionary">Dictionary</TabsTrigger>
            <TabsTrigger value="insight-types">Insight types</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Theme, background, and accent color</CardDescription>
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
                <BackgroundThemePicker />
                <AccentColorPicker />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recording</CardTitle>
                <CardDescription>How audio is captured and cleaned up</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Noise cancellation</p>
                    <p className="text-sm text-muted-foreground">
                      Clean up audio before transcription for better accuracy
                    </p>
                  </div>
                  <Switch
                    checked={denoiseEnabled}
                    onCheckedChange={toggleDenoise}
                    aria-label="Noise cancellation"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-detect meetings</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when a meeting app starts using your microphone so you can start recording
                    </p>
                  </div>
                  <Switch
                    checked={detectionEnabled}
                    onCheckedChange={toggleDetection}
                    aria-label="Auto-detect meetings"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Allow URL control</p>
                    <p className="text-sm text-muted-foreground">
                      Let other apps start and stop recordings via nootle:// links
                    </p>
                  </div>
                  <Switch
                    checked={remoteControlEnabled}
                    onCheckedChange={toggleRemoteControl}
                    aria-label="Allow URL control"
                  />
                </div>
              </CardContent>
            </Card>
            <PermissionsCard />
          </div>
        </TabsContent>

        <TabsContent value="api-keys" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>API keys</CardTitle>
                <CardDescription>
                  Keys for cloud AI providers. Ollama and the subscription CLIs
                  don't need one; see below.
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
            <Card>
              <CardHeader>
                <CardTitle>Auto-detected providers</CardTitle>
                <CardDescription>
                  Detected when Nootle starts. No API key needed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {AUTO_DETECTED_PROVIDERS.map((provider) => (
                    <AutoDetectedProviderRow
                      key={provider}
                      provider={provider}
                      detected={llmProviders.includes(provider)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <IntegrationsManager />
          </div>
        </TabsContent>

        <TabsContent value="models" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <ModelManagementCard />
          </div>
        </TabsContent>


        <TabsContent value="dictionary" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <DictionaryManager />
          </div>
        </TabsContent>

        <TabsContent value="insight-types" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <InsightTypesManager />
          </div>
        </TabsContent>

        <TabsContent value="about" className="mt-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
                <CardDescription>
                  Nootle v{version}
                </CardDescription>
                <CardAction>
                  <CheckForUpdatesButton />
                </CardAction>
              </CardHeader>
              <CardContent>
                <McpSetup />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CheckForUpdatesButton() {
  const { status } = useUpdater();
  const busy = status === "checking" || status === "downloading";
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => checkForUpdates(true)}>
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {status === "downloading" ? "Installing…" : "Check for updates"}
    </Button>
  );
}

function PermissionsCard() {
  const [permissions, setPermissions] = useState<{
    microphone: string;
    screen_recording: boolean;
    calendar: string;
  } | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await invoke<{
        microphone: string;
        screen_recording: boolean;
        calendar: string;
      }>("check_permissions");
      setPermissions(status);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRequest = useCallback(async (type: "microphone" | "screen_recording" | "calendar") => {
    setRequesting(type);
    try {
      if (type === "microphone") {
        await invoke("request_microphone_permission");
      } else if (type === "screen_recording") {
        await invoke("request_screen_recording_permission");
      } else {
        await invoke("request_calendar_permission");
      }
      await refresh();
    } finally {
      setRequesting(null);
    }
  }, [refresh]);

  const statusBadge = (granted: boolean) => (
    <Badge variant={granted ? "success" : "secondary"} size="sm">
      {granted ? "Granted" : "Not granted"}
    </Badge>
  );

  const rows: { label: string; key: "microphone" | "screen_recording" | "calendar"; granted: boolean; description: string }[] = permissions ? [
    { label: "Microphone", key: "microphone", granted: permissions.microphone === "granted", description: "Required for recording audio" },
    { label: "Screen recording", key: "screen_recording", granted: permissions.screen_recording, description: "Required for system audio capture" },
    { label: "Calendar", key: "calendar", granted: permissions.calendar === "granted", description: "Optional. Detect meetings from your calendar" },
  ] : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>
          macOS access needed for recording and meeting detection
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!permissions ? (
          <LoadingState message={LOADING_COPY.permissions} layout="inline" />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    {statusBadge(row.granted)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                </div>
                {!row.granted && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRequest(row.key)}
                    disabled={requesting !== null}
                  >
                    {requesting === row.key ? "Requesting…" : "Grant"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
        <CardTitle>Local models</CardTitle>
        <CardDescription>
          Models for transcription and speaker identification. They run entirely on your Mac.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {diskStatus
            .filter((model) => !MODELS_REQUIRING_AUTH.has(model.model_id))
            .map((model) => {
            const regModel = registry.find((r) => r.id === model.model_id);
            const isThisModelDownloading =
              isDownloading && progress?.model_id === model.model_id;
            const errorMessage =
              progress?.model_id === model.model_id &&
              typeof progress.state !== "string" &&
              "error" in progress.state
                ? progress.state.error.message
                : null;

            return (
              <div key={model.model_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        {model.name}
                      </span>
                      <Badge
                        variant={model.downloaded ? "success" : "secondary"}
                        size="sm"
                      >
                        {model.downloaded ? "Downloaded" : "Not downloaded"}
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

                    {!model.downloaded &&
                      regModel &&
                      regModel.variants.length > 1 && (
                        <div className="mt-2">
                          <VariantPicker
                            name={`settings-variant-${model.model_id}`}
                            variants={regModel.variants}
                            selected={getSelectedVariant(model.model_id)}
                            onSelect={(variantId) =>
                              setSelectedVariants((prev) => ({
                                ...prev,
                                [model.model_id]: variantId,
                              }))
                            }
                          />
                        </div>
                      )}

                    {isThisModelDownloading && progress && (
                      <div className="mt-2">
                        <DownloadProgressBar progress={progress} />
                      </div>
                    )}

                    {errorMessage && (
                      <p className="mt-2 text-xs text-destructive">
                        Download failed: {errorMessage}
                      </p>
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
                        {deleting === model.model_id ? "Deleting…" : "Delete"}
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
