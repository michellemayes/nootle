import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** An on/off app setting: its value (`fallback` until loaded or when unset)
 * and a setter that saves it. */
export function useBooleanSetting(key: string, fallback: boolean) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    invoke<string | null>("get_app_setting", { key })
      .then((v) => setValue(v === null ? fallback : v === "true"))
      .catch(() => {});
  }, [key, fallback]);
  const set = useCallback(
    (on: boolean) => {
      setValue(on);
      invoke("set_app_setting", { key, value: String(on) }).catch(() => {});
    },
    [key],
  );
  return [value, set] as const;
}
