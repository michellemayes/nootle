import { useCallback, useEffect, useId, useState, type KeyboardEvent } from "react";
import { CheckCircle2, CircleAlert, Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import { useBooleanSetting } from "@/hooks/useBooleanSetting";
import { useCustomEndpoint, type EndpointKind } from "@/hooks/useCustomEndpoint";

const COPY: Record<
  EndpointKind,
  { title: string; description: string; removeDescription: string; modelPlaceholder: string; urls: string[] }
> = {
  chat: {
    title: "Custom endpoint",
    description: "Any OpenAI-compatible API. Its models join the model picker.",
    removeDescription: "Its models leave the model picker, and its API key is deleted.",
    modelPlaceholder: "openai/gpt-5",
    urls: [
      "https://openrouter.ai/api/v1",
      "https://api.openai.com/v1",
      "https://api.together.xyz/v1",
      "http://localhost:1234/v1",
    ],
  },
  transcription: {
    title: "Cloud transcription",
    description:
      "Finished recordings are transcribed by an OpenAI-compatible API. Live transcripts stay on this Mac.",
    removeDescription: "Recordings go back to being transcribed only on this Mac, and its API key is deleted.",
    modelPlaceholder: "whisper-large-v3",
    urls: ["https://api.openai.com/v1", "https://api.groq.com/openai/v1", "http://localhost:8000/v1"],
  },
};

type TestState = { status: "idle" } | { status: "testing" } | { status: "ok" } | { status: "error"; message: string };

export function CustomEndpointCard({ kind }: { kind: EndpointKind }) {
  const copy = COPY[kind];
  const multiple = kind === "chat";
  const { endpoint, loaded, save, remove, test } = useCustomEndpoint(kind);
  const [localOnly] = useBooleanSetting("local_only", false);
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelDraft, setModelDraft] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const id = useId();

  const reset = useCallback(() => {
    setBaseUrl(endpoint?.base_url ?? "");
    setModels(multiple ? (endpoint?.models ?? []) : []);
    setModelDraft(multiple ? "" : (endpoint?.models[0] ?? ""));
    setApiKey("");
  }, [endpoint, multiple]);

  useEffect(reset, [reset]);

  const pendingModels = modelDraft.trim() ? [...models, modelDraft.trim()] : models;
  const dirty =
    baseUrl.trim() !== (endpoint?.base_url ?? "") ||
    apiKey.trim() !== "" ||
    pendingModels.join("\n") !== (endpoint?.models ?? []).join("\n");
  const canSave = dirty && baseUrl.trim() !== "" && pendingModels.length > 0;

  const addModel = () => {
    const model = modelDraft.trim().replace(/,$/, "");
    if (model && !models.includes(model)) setModels([...models, model]);
    setModelDraft("");
  };

  const onModelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addModel();
    } else if (e.key === "Backspace" && !modelDraft && models.length) {
      setModels(models.slice(0, -1));
    }
  };

  const runTest = async () => {
    setTestState({ status: "testing" });
    try {
      await test();
      setTestState({ status: "ok" });
    } catch (err) {
      setTestState({ status: "error", message: String(err) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(baseUrl, pendingModels, apiKey || undefined);
      await runTest();
    } catch (err) {
      toast(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    await remove();
    setTestState({ status: "idle" });
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
        {endpoint && (
          <CardAction>
            {kind === "transcription" && localOnly ? (
              <Badge variant="warning" size="sm">Paused by local-only mode</Badge>
            ) : (
              <Badge variant="success" size="sm">On</Badge>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
          <label className="grid min-w-0 grid-cols-1 content-start gap-1.5 @2xl/main:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Base URL</span>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={copy.urls[0]}
              list={`${id}-urls`}
              spellCheck={false}
              autoCapitalize="off"
            />
            <datalist id={`${id}-urls`}>
              {copy.urls.map((url) => <option key={url} value={url} />)}
            </datalist>
          </label>
          <label className="grid min-w-0 grid-cols-1 content-start gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">API key</span>
            <div className="flex items-center gap-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={endpoint?.has_key ? "•••••••• saved" : "Optional"}
                className="flex-1"
                spellCheck={false}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide key" : "Show key"}
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </label>
          <div className={cn("grid min-w-0 grid-cols-1 content-start gap-1.5", multiple && "@2xl/main:col-span-2")}>
            <label htmlFor={`${id}-model`} className="text-xs font-medium text-muted-foreground">
              {multiple ? "Models" : "Model"}
            </label>
            {multiple ? (
              <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
                {models.map((model) => (
                  <span
                    key={model}
                    className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded bg-secondary py-0.5 pl-2 pr-0.5 font-mono text-xs"
                  >
                    <span className="truncate">{model}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => setModels(models.filter((m) => m !== model))}
                      aria-label={`Remove ${model}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id={`${id}-model`}
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                  onKeyDown={onModelKey}
                  onBlur={addModel}
                  placeholder={models.length ? "" : copy.modelPlaceholder}
                  className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </div>
            ) : (
              <Input
                id={`${id}-model`}
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                placeholder={copy.modelPlaceholder}
                spellCheck={false}
                autoCapitalize="off"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {endpoint && !dirty ? (
            <>
              <Button size="sm" variant="outline" onClick={runTest} disabled={testState.status === "testing"}>
                {testState.status === "testing" && <Loader2 className="animate-spin" />}
                Test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove
              </Button>
              {testState.status === "ok" && (
                <span className="inline-flex items-center gap-1.5 text-sm text-success-foreground">
                  <CheckCircle2 className="size-4" /> Connected
                </span>
              )}
            </>
          ) : (
            <>
              <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
                {saving && <Loader2 className="animate-spin" />}
                {endpoint ? "Save changes" : "Save"}
              </Button>
              {endpoint && (
                <Button size="sm" variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
        {testState.status === "error" && !dirty && (
          <p className="flex items-start gap-1.5 break-words text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{testState.message}</span>
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title={`Remove ${copy.title.toLowerCase()}?`}
        description={copy.removeDescription}
        confirmLabel="Remove"
        onConfirm={handleRemove}
      />
    </Card>
  );
}
