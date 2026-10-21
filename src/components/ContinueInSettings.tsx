import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/EmojiPicker";
import { HandoffIcon } from "@/components/ContinueInButton";
import { useSetting } from "@/hooks/useBooleanSetting";
import { useHandoffApp } from "@/hooks/useHandoffApp";
import { CUSTOM_HANDOFF, HANDOFF_APPS, HANDOFF_URL_SETTING } from "@/lib/handoff";
import { cn } from "@/lib/utils";

/** Picks the app a meeting's "Continue in…" button opens, and its icon. */
export function ContinueInSettings() {
  const { app, setApp, name, nameSetting, icon, setIcon, Logo } = useHandoffApp();
  const urlSetting = useSetting(HANDOFF_URL_SETTING, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Continue in</CardTitle>
        <CardDescription>
          The app the button in a meeting's header opens with that meeting's notes, so you can keep
          talking about it there. Off in Local-only mode.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div role="radiogroup" aria-label="App" className="grid grid-cols-5 gap-2">
          {HANDOFF_APPS.map(({ id, name, Logo }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={app === id}
              onClick={() => setApp(id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-xs transition-colors hover:bg-accent",
                app === id && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <Logo className="h-5 w-5" />
              {name}
            </button>
          ))}
        </div>

        {app === CUSTOM_HANDOFF && (
          <div className="space-y-3">
            <SavedField id="handoff-name" label="Name" setting={nameSetting} maxLength={40} placeholder="Le Chat" />
            <SavedField
              id="handoff-url"
              label="Link"
              setting={urlSetting}
              placeholder="https://chat.mistral.ai/chat?q={prompt}"
              className="font-mono text-xs"
              hint={<>Put <code>{"{prompt}"}</code> where the meeting's notes go. Any app that takes a message in a link works</>}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Button icon</p>
            <p className="text-sm text-muted-foreground">The app's logo, or an emoji of your own</p>
          </div>
          <div className="flex items-center gap-3">
            <EmojiPicker value={icon} onChange={setIcon} placeholder="App logo" />
            <span
              className="flex size-8 items-center justify-center rounded-md border bg-background shadow-xs"
              title={`Continue in ${name}`}
              aria-label="Preview"
            >
              <HandoffIcon icon={icon} Logo={Logo} />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** A text setting edited as a draft and saved on blur or Enter, showing
 * why the backend refused it. */
function SavedField({ id, label, setting: [value, save, error], hint, ...input }: {
  id: string;
  label: string;
  setting: ReturnType<typeof useSetting>;
  hint?: React.ReactNode;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && save(draft);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-invalid={!!error}
        {...input}
      />
      {(error || hint) && (
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? hint}</p>
      )}
    </div>
  );
}
