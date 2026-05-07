import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible } from "@/components/Collapsible";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useWorkflows } from "@/hooks/useWorkflows";
import { useIntegrations } from "@/hooks/useIntegrations";
import { INTEGRATION_TYPES, ACTION_TYPES_BY_INTEGRATION } from "@/lib/integrations";
import { EmojiPicker } from "@/components/EmojiPicker";
import type { Workflow } from "@/types";

export function WorkflowsManager() {
  const { workflows, loading, createWorkflow, updateWorkflow, deleteWorkflow } = useWorkflows();
  const { integrations } = useIntegrations();
  const [editing, setEditing] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formIntegrationId, setFormIntegrationId] = useState("");
  const [formActionType, setFormActionType] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const connectedIntegrations = integrations.filter((i) =>
    INTEGRATION_TYPES.some((t) => t.type === i.integration_type),
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
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Workflows</CardTitle>
            <CardDescription className="mt-1">
              Automate post-meeting actions like posting summaries, creating tickets, or drafting emails.
            </CardDescription>
          </div>
          {editing === null && (
            <Button size="sm" onClick={startCreate} className="shrink-0">
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
            <Collapsible open={editing !== null}>
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
                    <EmojiPicker value={formIcon} onChange={setFormIcon} placeholder="Pick an emoji" />
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
            </Collapsible>

            {workflows.length === 0 && editing === null ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No workflows yet. Set one up and Nootle will handle the busywork after every meeting.
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
