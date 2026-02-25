import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
            className="mx-auto w-full max-w-lg overflow-y-auto max-h-[90vh] rounded-2xl border border-border bg-card p-8 shadow-2xl"
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
                  Nootle captures your meetings, transcribes them live, and
                  cooks up smart summaries — all on your Mac.
                </p>
                <MotionButton size="lg" onClick={next}>
                  Get Started
                </MotionButton>
              </div>
            )}

            {step === "Permissions" && (
              <PermissionsStep onNext={next} />
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
                  <MotionButton onClick={next}>Continue</MotionButton>
                </div>
              </div>
            )}

            {step === "Done" && (
              <div className="text-center">
                <h2 className="mb-2 text-3xl font-bold text-foreground">
                  You're ready to nootle!
                </h2>
                <p className="mb-8 text-muted-foreground">
                  Nootle will automatically detect meetings in Zoom, Teams, and
                  Google Meet. You can also start recording manually anytime.
                </p>
                <MotionButton size="lg" onClick={finish} disabled={saving}>
                  {saving ? "Setting up..." : "Start Using Nootle"}
                </MotionButton>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
  );
}

interface PermissionStatusData {
  microphone: string;
  screen_recording: boolean;
  calendar: string;
}

function PermissionsStep({ onNext }: { onNext: () => void }) {
  const [status, setStatus] = useState<PermissionStatusData | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const s = await invoke<PermissionStatusData>("check_permissions");
      setStatus(s);
    } catch (e) {
      console.error("Failed to check permissions:", e);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const allGranted =
    status?.microphone === "granted" &&
    status?.screen_recording === true &&
    status?.calendar === "granted";

  const requestPermission = async (type: "microphone" | "screen_recording" | "calendar") => {
    setRequesting(type);
    try {
      if (type === "microphone") {
        await invoke("request_microphone_permission");
      } else if (type === "screen_recording") {
        await invoke("request_screen_recording_permission");
      } else {
        await invoke("request_calendar_permission");
      }
      await checkStatus();
    } catch (e) {
      console.error(`Failed to request ${type} permission:`, e);
    } finally {
      setRequesting(null);
    }
  };

  const micGranted = status?.microphone === "granted";
  const screenGranted = status?.screen_recording === true;
  const calGranted = status?.calendar === "granted";

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-foreground">Permissions</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Nootle needs these permissions to record and transcribe your meetings.
      </p>
      <div className="space-y-3">
        <PermissionRow
          icon="🎙"
          title="Microphone"
          desc="Record your voice during meetings"
          granted={micGranted}
          onRequest={() => requestPermission("microphone")}
          requesting={requesting === "microphone"}
        />
        <PermissionRow
          icon="🖥"
          title="Screen Recording"
          desc="Capture system audio from meeting apps"
          granted={screenGranted}
          onRequest={() => requestPermission("screen_recording")}
          requesting={requesting === "screen_recording"}
          buttonLabel={screenGranted ? undefined : "Open System Settings"}
        />
        <PermissionRow
          icon="📅"
          title="Calendar"
          desc="Auto-detect meetings from your calendar"
          granted={calGranted}
          onRequest={() => requestPermission("calendar")}
          requesting={requesting === "calendar"}
        />
      </div>
      {!allGranted && (
        <p className="mt-4 text-xs text-muted-foreground">
          Screen Recording requires toggling in System Settings. It will be detected automatically.
        </p>
      )}
      <div className="mt-8 flex justify-end">
        <MotionButton onClick={onNext} disabled={!allGranted}>
          Continue
        </MotionButton>
      </div>
    </div>
  );
}

function PermissionRow({
  icon,
  title,
  desc,
  granted,
  onRequest,
  requesting,
  buttonLabel,
}: {
  icon: string;
  title: string;
  desc: string;
  granted: boolean;
  onRequest: () => void;
  requesting: boolean;
  buttonLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      {granted ? (
        <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400">
          Granted
        </Badge>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onRequest}
          disabled={requesting}
        >
          {requesting ? "..." : buttonLabel || "Grant"}
        </Button>
      )}
    </div>
  );
}
