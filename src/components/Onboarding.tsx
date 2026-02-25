import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useModelDownload,
  type ModelDefinition,
} from "@/hooks/useModelDownload";

const STEPS = ["Welcome", "Permissions", "Models", "API Keys", "Done"] as const;
type Step = (typeof STEPS)[number];

const PROVIDERS = [
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "google", name: "Google Gemini", placeholder: "AIza..." },
  { id: "groq", name: "Groq", placeholder: "gsk_..." },
] as const;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("Welcome");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const next = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      // Save API keys
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key.trim()) {
          await invoke("store_api_key", { provider, key: key.trim() });
        }
      }
      // Seed default prompts
      await invoke("seed_default_prompts");
      // Mark complete
      localStorage.setItem("onboarding_complete", "true");
      onComplete();
    } catch (e) {
      console.error("Onboarding error:", e);
      // Still complete even if seeding fails
      localStorage.setItem("onboarding_complete", "true");
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dark">
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-2xl"
          >
            {/* Progress dots */}
            <div className="mb-8 flex justify-center gap-2">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i <= stepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {step === "Welcome" && (
              <div className="text-center">
                <h1 className="mb-2 text-3xl font-bold text-foreground">
                  Welcome to Nootle
                </h1>
                <p className="mb-8 text-muted-foreground">
                  Your AI-powered meeting recorder. Nootle captures audio,
                  transcribes in real-time, and generates smart summaries — all
                  locally on your Mac.
                </p>
                <Button size="lg" onClick={next}>
                  Get Started
                </Button>
              </div>
            )}

            {step === "Permissions" && (
              <div>
                <h2 className="mb-2 text-2xl font-bold text-foreground">
                  Permissions
                </h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Nootle needs a few permissions to work. macOS will prompt you
                  when each is first needed.
                </p>
                <div className="space-y-4">
                  <PermissionRow
                    icon="🎤"
                    title="Microphone"
                    desc="Record your voice during meetings"
                  />
                  <PermissionRow
                    icon="🖥"
                    title="Screen Recording"
                    desc="Capture system audio from meeting apps"
                  />
                  <PermissionRow
                    icon="📅"
                    title="Calendar"
                    desc="Auto-detect meetings from your calendar"
                  />
                </div>
                <div className="mt-8 flex justify-end">
                  <Button onClick={next}>Continue</Button>
                </div>
              </div>
            )}

            {step === "Models" && <ModelsStep onNext={next} />}

            {step === "API Keys" && (
              <div>
                <h2 className="mb-2 text-2xl font-bold text-foreground">
                  AI Providers
                </h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Add API keys for AI-powered summaries and chat. You can skip
                  this and add them later in Settings. Keys are stored securely
                  in your macOS Keychain.
                </p>
                <div className="space-y-4">
                  {PROVIDERS.map((p) => (
                    <div key={p.id}>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        {p.name}
                      </label>
                      <Input
                        type="password"
                        placeholder={p.placeholder}
                        value={apiKeys[p.id] || ""}
                        onChange={(e) =>
                          setApiKeys((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex justify-between">
                  <Button variant="ghost" onClick={next}>
                    Skip
                  </Button>
                  <Button onClick={next}>Continue</Button>
                </div>
              </div>
            )}

            {step === "Done" && (
              <div className="text-center">
                <h2 className="mb-2 text-3xl font-bold text-foreground">
                  You're all set!
                </h2>
                <p className="mb-8 text-muted-foreground">
                  Nootle will automatically detect meetings in Zoom, Teams, and
                  Google Meet. You can also start recording manually anytime.
                </p>
                <Button size="lg" onClick={finish} disabled={saving}>
                  {saving ? "Setting up..." : "Start Using Nootle"}
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ModelsStep({ onNext }: { onNext: () => void }) {
  const { registry, diskStatus, progress, downloadModel, cancelDownload } =
    useModelDownload();

  // Track selected variant per model (default to "int8" for models that have it)
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [downloadingAll, setDownloadingAll] = useState(false);

  // Initialize default variant selections
  const variantSelections = useMemo(() => {
    const selections: Record<string, string> = {};
    for (const model of registry) {
      if (selectedVariants[model.id]) {
        selections[model.id] = selectedVariants[model.id];
      } else if (model.variants.length === 1) {
        selections[model.id] = model.variants[0].id;
      } else {
        // Default to "int8" if available, otherwise first variant
        const int8 = model.variants.find((v) => v.id === "int8");
        selections[model.id] = int8 ? "int8" : model.variants[0].id;
      }
    }
    return selections;
  }, [registry, selectedVariants]);

  const allDownloaded = registry.length > 0 && registry.every((model) => {
    const status = diskStatus.find((d) => d.model_id === model.id);
    return status?.downloaded;
  });

  const isDownloading = progress !== null && typeof progress.state === "string" && (progress.state === "downloading" || progress.state === "verifying");

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    for (const model of registry) {
      const status = diskStatus.find((d) => d.model_id === model.id);
      if (status?.downloaded) continue;
      const variantId = variantSelections[model.id];
      if (variantId) {
        try {
          await downloadModel(model.id, variantId);
        } catch (e) {
          console.error(`Failed to download ${model.id}:`, e);
          break;
        }
      }
    }
    setDownloadingAll(false);
  };

  const getModelStatus = (model: ModelDefinition) => {
    return diskStatus.find((d) => d.model_id === model.id);
  };

  const getProgressState = (): string => {
    if (!progress) return "";
    if (typeof progress.state === "string") return progress.state;
    if (typeof progress.state === "object" && "error" in progress.state)
      return `Error: ${progress.state.error.message}`;
    return "";
  };

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-foreground">AI Models</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Download local AI models for transcription and speaker identification.
        These run entirely on your Mac for privacy and speed.
      </p>

      <div className="space-y-4">
        {registry.map((model) => {
          const status = getModelStatus(model);
          const isThisModelDownloading =
            isDownloading && progress?.model_id === model.id;

          return (
            <div
              key={model.id}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-foreground">
                  {model.name}
                </span>
                {status?.downloaded && (
                  <Badge
                    variant="secondary"
                    className="bg-green-500/15 text-green-500 text-[10px]"
                  >
                    Downloaded
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {model.description}
              </p>

              {/* Variant picker for models with multiple variants */}
              {!status?.downloaded && model.variants.length > 1 && (
                <div className="flex gap-3 mb-3">
                  {model.variants.map((variant) => (
                    <label
                      key={variant.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`variant-${model.id}`}
                        checked={variantSelections[model.id] === variant.id}
                        onChange={() =>
                          setSelectedVariants((prev) => ({
                            ...prev,
                            [model.id]: variant.id,
                          }))
                        }
                        className="accent-primary"
                      />
                      <span className="text-sm text-foreground">
                        {variant.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({formatBytes(variant.total_size_bytes)})
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Single variant - show size */}
              {!status?.downloaded && model.variants.length === 1 && (
                <p className="text-xs text-muted-foreground mb-3">
                  Size: {formatBytes(model.variants[0].total_size_bytes)}
                </p>
              )}

              {/* Progress bar for this model */}
              {isThisModelDownloading && progress && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {getProgressState() === "verifying"
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
          );
        })}
      </div>

      {/* Global progress and actions */}
      <div className="mt-8 flex justify-between items-center">
        <Button variant="ghost" onClick={onNext}>
          Skip
        </Button>

        <div className="flex gap-2">
          {isDownloading && (
            <Button
              variant="outline"
              onClick={cancelDownload}
            >
              Cancel
            </Button>
          )}

          {allDownloaded ? (
            <Button onClick={onNext}>Continue</Button>
          ) : (
            <Button
              onClick={handleDownloadAll}
              disabled={isDownloading || downloadingAll || registry.length === 0}
            >
              {isDownloading
                ? "Downloading..."
                : "Download All"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionRow({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
