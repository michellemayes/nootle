import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useLLM } from "@/hooks/useLLM";
import { useModelDownload } from "@/hooks/useModelDownload";
import { useTheme } from "@/hooks/useTheme";

import { useInsightTypes } from "@/hooks/useInsightTypes";
import { useAppVersion } from "@/hooks/useAppVersion";
import { AccentColorPicker } from "@/components/AccentColorPicker";
import { EyeOff, Eye, Moon, Sun, Pencil, Trash2, Plus, Link, Unlink } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useWorkflows } from "@/hooks/useWorkflows";
import type { Workflow } from "@/types";

const PROVIDERS = ["openai", "anthropic", "google", "groq", "openrouter"];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  linear: "Linear",
  asana: "Asana",
  obsidian: "Obsidian",
};

function getMcpConfig(exePath: string) {
  return `{
  "mcpServers": {
    "nootle": {
      "command": "${exePath}",
      "args": ["--mcp"]
    }
  }
}`;
}

function getClaudeCommand(exePath: string) {
  return `claude mcp add nootle -- ${exePath} --mcp`;
}

const INTEGRATION_TYPES = [
  { type: "slack", name: "Slack", fields: [{ key: "bot_token", label: "Bot Token", placeholder: "xoxb-..." }] },
  { type: "notion", name: "Notion", fields: [{ key: "api_key", label: "API Key", placeholder: "secret_..." }] },
  { type: "confluence", name: "Confluence", fields: [
    { key: "email", label: "Email", placeholder: "user@example.com" },
    { key: "api_token", label: "API Token", placeholder: "Enter API token" },
    { key: "base_url", label: "Base URL", placeholder: "https://your-domain.atlassian.net" },
  ] },
  { type: "github", name: "GitHub", fields: [{ key: "token", label: "Token", placeholder: "ghp_..." }] },
  { type: "linear", name: "Linear", fields: [{ key: "api_key", label: "API Key", placeholder: "lin_api_..." }] },
  { type: "asana", name: "Asana", fields: [{ key: "token", label: "Token", placeholder: "Enter Asana token" }] },
  { type: "email", name: "Email", fields: [] },
  { type: "obsidian", name: "Obsidian", fields: [{ key: "vault_path", label: "Vault Path", placeholder: "/path/to/vault" }] },
] as const;

const ACTION_TYPES_BY_INTEGRATION: Record<string, { value: string; label: string; configFields: { key: string; label: string; placeholder: string; required: boolean }[] }[]> = {
  slack: [{ value: "post_summary", label: "Post Summary", configFields: [
    { key: "channel", label: "Channel", placeholder: "#general", required: true },
    { key: "message_template", label: "Message Template", placeholder: "Optional custom template", required: false },
  ] }],
  notion: [{ value: "create_page", label: "Create Page", configFields: [
    { key: "database_id", label: "Database ID", placeholder: "Enter Notion database ID", required: true },
  ] }],
  confluence: [{ value: "create_page", label: "Create Page", configFields: [
    { key: "space_key", label: "Space Key", placeholder: "e.g. ENG", required: true },
  ] }],
  github: [{ value: "create_issues", label: "Create Issues", configFields: [
    { key: "repo", label: "Repository", placeholder: "owner/repo", required: true },
  ] }],
  linear: [{ value: "create_issues", label: "Create Issues", configFields: [
    { key: "team_id", label: "Team ID", placeholder: "Enter Linear team ID", required: true },
    { key: "project_id", label: "Project ID", placeholder: "Optional project ID", required: false },
  ] }],
  asana: [{ value: "create_tasks", label: "Create Tasks", configFields: [
    { key: "project_id", label: "Project ID", placeholder: "Enter Asana project ID", required: true },
  ] }],
  email: [{ value: "generate_draft", label: "Generate Draft", configFields: [
    { key: "subject", label: "Subject", placeholder: "Optional subject line", required: false },
    { key: "body", label: "Body", placeholder: "Optional body template", required: false },
  ] }],
  obsidian: [{ value: "create_note", label: "Create Note", configFields: [
    { key: "subfolder", label: "Subfolder", placeholder: "Meetings", required: true },
    { key: "filename_template", label: "Filename Template", placeholder: "{{date}} - {{title}}", required: false },
    { key: "note_template", label: "Note Template", placeholder: "Optional custom template", required: false },
  ] }],
};

function IntegrationCard({ intType, connectedIntegration, onConnect, onDisconnect }: {
  intType: typeof INTEGRATION_TYPES[number];
  connectedIntegration: { id: string; credentials_json: string } | undefined;
  onConnect: (type: string, name: string, creds: Record<string, string>) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const isConnected = !!connectedIntegration;
  const isEmail = intType.type === "email";

  const handleConnect = async () => {
    if (intType.type === "obsidian") {
      const speakerMap: Record<string, string> = {};
      const keys = (fields._speakerKeys ?? "").split(",").filter(Boolean);
      keys.forEach((key, i) => {
        const value = fields[`_speakerVal_${i}`]?.trim();
        if (key.trim() && value) {
          speakerMap[key.trim()] = value;
        }
      });
      if (!fields.vault_path?.trim()) {
        return;
      }
      setSaving(true);
      try {
        await onConnect("obsidian", "Obsidian", {
          vault_path: fields.vault_path,
          speaker_map: JSON.stringify(speakerMap),
        });
        setFields({});
        setExpanded(false);
      } finally {
        setSaving(false);
      }
      return;
    }
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
    setSaving(true);
    try {
      await onConnect(intType.type, intType.name, fields);
      setFields({});
      setExpanded(false);
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
          <span className="text-sm font-medium">{intType.name}</span>
          {isConnected ? (
            <Badge variant="secondary" className="bg-green-500/15 text-green-500 text-[10px]">
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Not Connected</Badge>
          )}
        </div>
        {isConnected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={saving}>
            <Unlink className="h-3.5 w-3.5 mr-1.5" />
            Disconnect
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleConnect} disabled={saving}>
            <Link className="h-3.5 w-3.5 mr-1.5" />
            {isEmail ? "Enable" : "Connect"}
          </Button>
        )}
      </div>
      <AnimatePresence>
        {expanded && !isConnected && intType.fields.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 ml-0 space-y-2 pl-0">
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
                          const selected = await open({ directory: true, title: "Select Obsidian Vault" });
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
              {intType.type === "obsidian" && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs text-muted-foreground font-medium">Speaker Mapping</label>
                  <p className="text-[11px] text-muted-foreground">Map transcript labels to names. Mapped names become [[wikilinks]] in Obsidian.</p>
                  {(fields._speakerKeys ?? "").split(",").filter(Boolean).map((key, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Speaker 1"
                        value={key}
                        onChange={(e) => {
                          const keys = (fields._speakerKeys ?? "").split(",").filter(Boolean);
                          keys[i] = e.target.value;
                          setFields((prev) => ({ ...prev, _speakerKeys: keys.join(",") }));
                        }}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input
                        placeholder="Person Name"
                        value={fields[`_speakerVal_${i}`] ?? ""}
                        onChange={(e) => setFields((prev) => ({ ...prev, [`_speakerVal_${i}`]: e.target.value }))}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="sm" onClick={() => {
                        const keys = (fields._speakerKeys ?? "").split(",").filter(Boolean);
                        keys.splice(i, 1);
                        const next: Record<string, string> = { ...fields, _speakerKeys: keys.join(",") };
                        delete next[`_speakerVal_${i}`];
                        setFields(next);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => {
                    const keys = (fields._speakerKeys ?? "").split(",").filter(Boolean);
                    keys.push("");
                    setFields((prev) => ({ ...prev, _speakerKeys: keys.join(",") }));
                  }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Speaker
                  </Button>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setExpanded(false); setFields({}); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={saving || !intType.fields.every((f) => fields[f.key]?.trim())}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IntegrationsManager() {
  const { integrations, loading, createIntegration, deleteIntegration } = useIntegrations();

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
          Connect services to use in post-meeting workflows. These are separate from the API keys above, which are used for LLM providers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="divide-y">
            {INTEGRATION_TYPES.map((intType) => (
              <IntegrationCard
                key={intType.type}
                intType={intType}
                connectedIntegration={integrations.find((i) => i.integration_type === intType.type)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkflowsManager() {
  const { workflows, loading, createWorkflow, updateWorkflow, deleteWorkflow } = useWorkflows();
  const { integrations } = useIntegrations();
  const [editing, setEditing] = useState<string | null>(null); // workflow id or "new"
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formIntegrationId, setFormIntegrationId] = useState("");
  const [formActionType, setFormActionType] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const connectedIntegrations = integrations.filter((i) =>
    INTEGRATION_TYPES.some((t) => t.type === i.integration_type)
  );

  const selectedIntegration = integrations.find((i) => i.id === formIntegrationId);
  const selectedIntegrationType = selectedIntegration?.integration_type ?? "";
  const availableActions = ACTION_TYPES_BY_INTEGRATION[selectedIntegrationType] ?? [];
  const selectedAction = availableActions.find((a) => a.value === formActionType);

  const resetForm = () => {
    setEditing(null);
    setFormName("");
    setFormDescription("");
    setFormIcon("");
    setFormIntegrationId("");
    setFormActionType("");
    setFormConfig({});
  };

  const startCreate = () => {
    resetForm();
    setEditing("new");
  };

  const startEdit = (wf: Workflow) => {
    setEditing(wf.id);
    setFormName(wf.name);
    setFormDescription(wf.description ?? "");
    setFormIcon(wf.icon ?? "");
    setFormIntegrationId(wf.integration_id);
    setFormActionType(wf.action_type);
    try {
      setFormConfig(JSON.parse(wf.config_json));
    } catch {
      setFormConfig({});
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || !formIntegrationId || !formActionType) return;
    setSaving(true);
    try {
      const configJson = JSON.stringify(formConfig);
      if (editing === "new") {
        await createWorkflow(
          formName,
          formDescription || null,
          formIcon || null,
          formIntegrationId,
          formActionType,
          configJson,
        );
      } else if (editing) {
        const existing = workflows.find((w) => w.id === editing);
        await updateWorkflow(
          editing,
          formName,
          formDescription || null,
          formIcon || null,
          formActionType,
          configJson,
          existing?.is_enabled ?? true,
        );
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (wf: Workflow) => {
    await updateWorkflow(
      wf.id,
      wf.name,
      wf.description,
      wf.icon,
      wf.action_type,
      wf.config_json,
      !wf.is_enabled,
    );
  };

  const getIntegrationTypeName = (integrationId: string) => {
    const integration = integrations.find((i) => i.id === integrationId);
    if (!integration) return "Unknown";
    return INTEGRATION_TYPES.find((t) => t.type === integration.integration_type)?.name ?? integration.integration_type;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Workflows</CardTitle>
            <CardDescription>
              Automate post-meeting actions like posting summaries, creating tickets, or drafting emails.
            </CardDescription>
          </div>
          {editing === null && (
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Workflow
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {editing !== null && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border rounded-lg p-4 space-y-3 mb-3">
                    <h4 className="text-sm font-medium">{editing === "new" ? "New Workflow" : "Edit Workflow"}</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-28 shrink-0">Name *</label>
                        <Input
                          placeholder="e.g. Post summary to Slack"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-28 shrink-0">Description</label>
                        <Input
                          placeholder="Optional description"
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-28 shrink-0">Icon</label>
                        <Input
                          placeholder="Optional icon (emoji or text)"
                          value={formIcon}
                          onChange={(e) => setFormIcon(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-28 shrink-0">Integration *</label>
                        <select
                          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={formIntegrationId}
                          onChange={(e) => {
                            setFormIntegrationId(e.target.value);
                            setFormActionType("");
                            setFormConfig({});
                          }}
                        >
                          <option value="">Select integration...</option>
                          {connectedIntegrations.map((i) => (
                            <option key={i.id} value={i.id}>
                              {INTEGRATION_TYPES.find((t) => t.type === i.integration_type)?.name ?? i.integration_type}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedIntegrationType && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground w-28 shrink-0">Action *</label>
                          <select
                            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                            value={formActionType}
                            onChange={(e) => {
                              setFormActionType(e.target.value);
                              setFormConfig({});
                            }}
                          >
                            <option value="">Select action...</option>
                            {availableActions.map((a) => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {selectedAction && selectedAction.configFields.map((field) => (
                        <div key={field.key} className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground w-28 shrink-0">
                            {field.label}{field.required ? " *" : ""}
                          </label>
                          <Input
                            placeholder={field.placeholder}
                            value={formConfig[field.key] ?? ""}
                            onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            className="flex-1"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving || !formName.trim() || !formIntegrationId || !formActionType}
                      >
                        {saving ? "Saving..." : editing === "new" ? "Create" : "Save"}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {workflows.length === 0 && editing === null ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No workflows yet. Create one to automate your post-meeting tasks.
              </p>
            ) : (
              <div className="divide-y">
                {workflows.map((wf) => (
                  <div key={wf.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {wf.icon && <span className="text-sm">{wf.icon}</span>}
                        <span className="text-sm font-medium">{wf.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {getIntegrationTypeName(wf.integration_id)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{wf.action_type}</span>
                      </div>
                      {wf.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{wf.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleEnabled(wf)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          wf.is_enabled ? "bg-primary" : "bg-input"
                        }`}
                        title={wf.is_enabled ? "Enabled" : "Disabled"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                            wf.is_enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => startEdit(wf)}
                        disabled={editing !== null}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteWorkflow(wf.id)}
                        disabled={editing !== null}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
        <span className="text-sm font-medium">{PROVIDER_DISPLAY_NAMES[provider] ?? provider}</span>
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
        <CardTitle>Insight Types</CardTitle>
        <CardDescription>
          Configure what types of insights to extract from meetings and customize the extraction prompts
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
                  <Input
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    className="h-8 w-32"
                    placeholder="Icon"
                  />
                </div>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-8"
                  placeholder="Description"
                />
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  className="w-full min-h-[80px] rounded-md border bg-transparent px-3 py-2 text-sm"
                  placeholder="Extraction prompt"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editHasAction}
                      onChange={(e) => setEditHasAction(e.target.checked)}
                      className="accent-primary"
                    />
                    Has action fields (assignee, due date)
                  </label>
                </div>
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
                    <Badge variant="secondary" className="text-[10px]">{t.slug}</Badge>
                    {t.is_builtin && <Badge variant="outline" className="text-[10px]">Built-in</Badge>}
                    {t.has_action_fields && <Badge variant="outline" className="text-[10px]">Action fields</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!t.is_builtin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteInsightType(t.id)}
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
              <Input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                className="h-8 w-32"
                placeholder="Icon"
              />
            </div>
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="h-8"
              placeholder="Description (optional)"
            />
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="w-full min-h-[80px] rounded-md border bg-transparent px-3 py-2 text-sm"
              placeholder="Extraction prompt — tell the LLM how to identify this type"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newHasAction}
                  onChange={(e) => setNewHasAction(e.target.checked)}
                  className="accent-primary"
                />
                Has action fields (assignee, due date)
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || !newSlug.trim() || !newPrompt.trim()}>
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Custom Type
          </Button>
        )}
      </CardContent>
    </Card>
  );
}


export function SettingsPage() {
  const { storedProviders, storeKey, deleteKey } = useApiKeys();
  const { providers: llmProviders } = useLLM();
  const { theme, toggleTheme } = useTheme();
  const version = useAppVersion();
  const [copied, setCopied] = useState<"json" | "claude" | false>(false);
  const [exePath, setExePath] = useState("/path/to/nootle");
  const [denoiseEnabled, setDenoiseEnabled] = useState(true);
  const [detectionEnabled, setDetectionEnabled] = useState(true);

  useEffect(() => {
    invoke<string>("get_exe_path").then(setExePath).catch(() => {});
    invoke<string | null>("get_app_setting", { key: "denoise_enabled" })
      .then((val) => setDenoiseEnabled(val !== "false"))
      .catch(() => {});
    invoke<string | null>("get_app_setting", { key: "detection_enabled" })
      .then((val) => setDetectionEnabled(val !== "false"))
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

  const handleCopyJson = useCallback(async () => {
    await navigator.clipboard.writeText(getMcpConfig(exePath));
    setCopied("json");
    setTimeout(() => setCopied(false), 2000);
  }, [exePath]);

  const handleCopyClaude = useCallback(async () => {
    await navigator.clipboard.writeText(getClaudeCommand(exePath));
    setCopied("claude");
    setTimeout(() => setCopied(false), 2000);
  }, [exePath]);

  // Merge known providers with any discovered from LLM, excluding Ollama
  // (Ollama is auto-detected and doesn't need an API key)
  const allProviders = Array.from(
    new Set([...PROVIDERS, ...llmProviders]),
  ).filter((p) => p !== "ollama");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure API keys and application settings
        </p>
      </div>

      <Tabs defaultValue="general" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b px-6 py-4">
          <TabsList className="h-10">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>

            <TabsTrigger value="insight-types">Insight Types</TabsTrigger>
            <TabsTrigger value="about">About / MCP</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
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
            <Card>
              <CardHeader>
                <CardTitle>Recording</CardTitle>
                <CardDescription>Configure audio recording behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Noise cancellation</p>
                    <p className="text-sm text-muted-foreground">
                      Clean up audio before transcription for better accuracy
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={denoiseEnabled}
                    onClick={() => toggleDenoise(!denoiseEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      denoiseEnabled ? "bg-primary" : "bg-input"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                        denoiseEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-detect meetings</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when a meeting is detected so you can start recording
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={detectionEnabled}
                    onClick={() => toggleDetection(!detectionEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      detectionEnabled ? "bg-primary" : "bg-input"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                        detectionEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>
            <PermissionsCard />
          </div>
        </TabsContent>

        <TabsContent value="api-keys" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Configure API keys for LLM providers. Using Ollama? No key needed
                  — Nootle auto-detects it when running.
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
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <IntegrationsManager />
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <WorkflowsManager />
          </div>
        </TabsContent>

        <TabsContent value="models" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <ModelManagementCard />
          </div>
        </TabsContent>


        <TabsContent value="insight-types" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <InsightTypesManager />
          </div>
        </TabsContent>

        <TabsContent value="about" className="flex-1 mt-0 overflow-auto">
          <div className="flex flex-col gap-8 p-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
                <CardDescription>
                  Nootle v{version} — Your meetings, transcribed and summarized with a twist
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
                      {getMcpConfig(exePath)}
                    </pre>
                    <Button
                      variant="secondary"
                      size="xs"
                      className="absolute top-2 right-2"
                      onClick={handleCopyJson}
                    >
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={copied === "json" ? "check" : "copy"}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: copied === "json" ? [1, 1.2, 1] : 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                        >
                          {copied === "json" ? "\u2713 Copied" : "Copy"}
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                  </div>
                  <h3 className="text-sm font-medium mt-4 mb-2">Claude Code</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Or install directly with Claude Code:
                  </p>
                  <div className="relative">
                    <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
                      {getClaudeCommand(exePath)}
                    </pre>
                    <Button
                      variant="secondary"
                      size="xs"
                      className="absolute top-2 right-2"
                      onClick={handleCopyClaude}
                    >
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={copied === "claude" ? "check" : "copy"}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: copied === "claude" ? [1, 1.2, 1] : 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                        >
                          {copied === "claude" ? "\u2713 Copied" : "Copy"}
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
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
    <Badge
      variant="secondary"
      className={granted ? "bg-green-500/15 text-green-500 text-[10px]" : "text-[10px]"}
    >
      {granted ? "Granted" : "Not Granted"}
    </Badge>
  );

  const rows: { label: string; key: "microphone" | "screen_recording" | "calendar"; granted: boolean; description: string }[] = permissions ? [
    { label: "Microphone", key: "microphone", granted: permissions.microphone === "granted", description: "Required for recording audio" },
    { label: "Screen Recording", key: "screen_recording", granted: permissions.screen_recording, description: "Required for system audio capture" },
    { label: "Calendar", key: "calendar", granted: permissions.calendar === "granted", description: "Auto-detect meetings from your calendar" },
  ] : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>
          Manage macOS permissions for recording and calendar access
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!permissions ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
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
                    {requesting === row.key ? "..." : "Grant"}
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
