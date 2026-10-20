import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** An app setting: its value (`fallback` until loaded or when unset) and a
 * setter that saves it. */
export function useSetting(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    invoke<string | null>("get_app_setting", { key })
      .then((v) => setValue(v ?? fallback))
      .catch(() => {});
  }, [key, fallback]);
  const set = useCallback(
    (next: string) => {
      setValue(next);
      invoke("set_app_setting", { key, value: next }).catch(() => {});
    },
    [key],
  );
  return [value, set] as const;
}

/** An on/off app setting, stored as "true" or "false". */
export function useBooleanSetting(key: string, fallback: boolean) {
  const [value, set] = useSetting(key, String(fallback));
  const setBool = useCallback((on: boolean) => set(String(on)), [set]);
  return [value === "true", setBool] as const;
}
