import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STEPS = ["Welcome", "Permissions", "API Keys", "Done"] as const;
type Step = (typeof STEPS)[number];

const PROVIDERS = [
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "google", name: "Google Gemini", placeholder: "AIza..." },
  { id: "groq", name: "Groq", placeholder: "gsk_..." },
] as const;

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
