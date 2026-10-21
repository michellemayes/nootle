import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** An app setting: its value (`fallback` until loaded or when unset), a
 * setter that saves it, and why the last save was refused, if it was. */
export function useSetting(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    invoke<string | null>("get_app_setting", { key })
      .then((v) => setValue(v ?? fallback))
      .catch(() => {});
  }, [key, fallback]);
  const set = useCallback(
    (next: string) => {
      setValue(next);
      invoke("set_app_setting", { key, value: next })
        .then(() => setError(null))
        .catch((err) => setError(String(err)));
    },
    [key],
  );
  return [value, set, error] as const;
}

/** An on/off app setting, stored as "true" or "false". */
export function useBooleanSetting(key: string, fallback: boolean) {
  const [value, set] = useSetting(key, String(fallback));
  const setBool = useCallback((on: boolean) => set(String(on)), [set]);
  return [value === "true", setBool] as const;
}
