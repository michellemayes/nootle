import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, LOADING_COPY } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Plus, Pencil, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { useWorkflows } from "@/hooks/useWorkflows";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useTemplates } from "@/hooks/useTemplates";
import { INTEGRATION_TYPES, ACTION_TYPES_BY_INTEGRATION } from "@/lib/integrations";
import { EmojiPicker } from "@/components/EmojiPicker";
import type { Workflow } from "@/types";

interface WorkflowsManagerProps {
  /** Whether the "new workflow" dialog is open; owned by the page's tab bar. */
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
}

export function WorkflowsManager({ creating, onCreatingChange }: WorkflowsManagerProps) {
  const { workflows, loading, createWorkflow, updateWorkflow, deleteWorkflow } = useWorkflows();
  const { integrations } = useIntegrations();
  const { templates } = useTemplates();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = creating ? "new" : editingId;
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formIntegrationId, setFormIntegrationId] = useState("");
  const [formActionType, setFormActionType] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);

  const connectedIntegrations = integrations.filter((i) =>
    INTEGRATION_TYPES.some((t) => t.type === i.integration_type),
  );

  const selectedIntegration = integrations.find((i) => i.id === formIntegrationId);
  const selectedIntegrationType = selectedIntegration?.integration_type ?? "";
  const availableActions = ACTION_TYPES_BY_INTEGRATION[selectedIntegrationType] ?? [];
  const selectedAction = availableActions.find((a) => a.value === formActionType);

  const resetForm = () => {
    setEditingId(null);
    onCreatingChange(false);
    setFormName("");
    setFormDescription("");
    setFormIcon("");
    setFormIntegrationId("");
    setFormActionType("");
    setFormConfig({});
  };

  const startEdit = (wf: Workflow) => {
    setEditingId(wf.id);
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
          formIntegrationId,
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
      wf.integration_id,
      wf.action_type,
      wf.config_json,
      !wf.is_enabled,
    );
  };

  const getActionLabel = (wf: Workflow) => {
    const integration = integrations.find((i) => i.id === wf.integration_id);
    const actions = ACTION_TYPES_BY_INTEGRATION[integration?.integration_type ?? ""] ?? [];
    return actions.find((a) => a.value === wf.action_type)?.label ?? wf.action_type;
  };

  const getIntegrationTypeName = (integrationId: string) => {
    const integration = integrations.find((i) => i.id === integrationId);
    if (!integration) return "Unknown";
    return INTEGRATION_TYPES.find((t) => t.type === integration.integration_type)?.name ?? integration.integration_type;
  };

  return (
    <>
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New workflow" : "Edit workflow"}</DialogTitle>
            <DialogDescription>
              {editing === "new"
                ? "Automate a post-meeting action like posting a summary, creating a ticket, or drafting an email."
                : "Update what this workflow does after a meeting."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <Input
                placeholder="e.g. Post summary to Slack"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Input
                placeholder="Optional"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Icon</label>
              <EmojiPicker value={formIcon} onChange={setFormIcon} placeholder="Pick an emoji" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Integration</label>
              <Select
                containerClassName="w-full"
                value={formIntegrationId}
                onChange={(e) => {
                  setFormIntegrationId(e.target.value);
                  setFormActionType("");
                  setFormConfig({});
                }}
                aria-label="Integration"
              >
                <option value="">Select integration…</option>
                {connectedIntegrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {INTEGRATION_TYPES.find((t) => t.type === i.integration_type)?.name ?? i.integration_type}
                  </option>
                ))}
              </Select>
              {connectedIntegrations.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect an integration in Settings → Integrations first.
                </p>
              )}
            </div>
            {selectedIntegrationType && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Action</label>
                <Select
                  containerClassName="w-full"
                  value={formActionType}
                  onChange={(e) => {
                    setFormActionType(e.target.value);
                    setFormConfig({});
                  }}
                  aria-label="Action"
                >
                  <option value="">Select action…</option>
                  {availableActions.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </Select>
              </div>
            )}
            {selectedAction && selectedAction.configFields.map((field) => (
              <div key={field.key}>
                <label className="text-sm font-medium mb-1.5 block">
                  {field.label}
                  {!field.required && (
                    <span className="font-normal text-muted-foreground"> (optional)</span>
                  )}
                </label>
                {field.key === "template_id" ? (
                  <Select
                    containerClassName="w-full"
                    value={formConfig[field.key] ?? ""}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    title={field.placeholder}
                    aria-label={field.label}
                  >
                    <option value="">No source template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    placeholder={field.placeholder}
                    value={formConfig[field.key] ?? ""}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formIntegrationId || !formActionType}
            >
              {saving ? "Saving…" : editing === "new" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <LoadingState message={LOADING_COPY.workflows} layout="inline" />
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No workflows yet"
          description="Workflows run after a meeting to post summaries, create tickets, or draft emails."
          action={
            <Button size="sm" onClick={() => onCreatingChange(true)}>
              <Plus /> New workflow
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {workflows.map((wf) => (
            <div key={wf.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {wf.icon && <span className="text-sm">{wf.icon}</span>}
                  <span className="text-sm font-medium">{wf.name}</span>
                  <Badge variant="secondary" size="sm">
                    {getIntegrationTypeName(wf.integration_id)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{getActionLabel(wf)}</span>
                </div>
                {wf.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{wf.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={wf.is_enabled}
                  onCheckedChange={() => handleToggleEnabled(wf)}
                  title={wf.is_enabled ? "Enabled" : "Disabled"}
                  aria-label={`Enable ${wf.name}`}
                  className="mr-2"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => startEdit(wf)}
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(wf)}
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete workflow?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>{" "}
            will be permanently deleted. Past runs stay in their meeting history.
          </>
        }
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteWorkflow(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
