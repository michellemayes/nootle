import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

export function useAppVersion(): string {
  const [version, setVersion] = useState("dev");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return version;
}
