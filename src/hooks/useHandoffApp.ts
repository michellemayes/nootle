import { useSetting } from "@/hooks/useBooleanSetting";
import {
  CUSTOM_HANDOFF,
  HANDOFF_APPS,
  HANDOFF_APP_SETTING,
  HANDOFF_ICON_SETTING,
  HANDOFF_NAME_SETTING,
} from "@/lib/handoff";

/** The app "Continue in…" opens, and how its button looks. */
export function useHandoffApp() {
  const [app, setApp] = useSetting(HANDOFF_APP_SETTING, "claude");
  const nameSetting = useSetting(HANDOFF_NAME_SETTING, "");
  const [icon, setIcon] = useSetting(HANDOFF_ICON_SETTING, "");
  const preset = HANDOFF_APPS.find((a) => a.id === app) ?? HANDOFF_APPS[0];
  const name = app === CUSTOM_HANDOFF ? nameSetting[0].trim() || "your app" : preset.name;
  return { app, setApp, name, nameSetting, icon, setIcon, Logo: preset.Logo };
}
