import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "error";

export interface UpdaterState {
  status: UpdateStatus;
  version: string | null;
  /** Download progress as a whole percent, or null while the total size is unknown. */
  progress: number | null;
  /** The banner was dismissed for this version; cleared by a manual check. */
  dismissed: boolean;
  /** The last check was user-initiated, so "up to date" and errors are worth showing. */
  manual: boolean;
}

const STARTUP_DELAY_MS = 5000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Module-level so every route's Layout shares one check, one download, one banner.
let state: UpdaterState = {
  status: "idle",
  version: null,
  progress: null,
  dismissed: false,
  manual: false,
};
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export async function checkForUpdates(manual = false) {
  if (state.status === "checking" || state.status === "downloading") return;
  // A background re-check would only flicker a banner that's already offering an update.
  if (!manual && state.status === "available" && !state.dismissed) return;
  set({ status: "checking", manual, ...(manual && { dismissed: false }) });
  try {
    const update = await check();
    // Each Update holds a Rust-side resource; release the one it replaces.
    pending?.close().catch(() => {});
    pending = update;
    if (update) {
      const isNewVersion = update.version !== state.version;
      set({
        status: "available",
        version: update.version,
        ...(isNewVersion && { dismissed: false }),
      });
    } else {
      set({ status: "upToDate", version: null });
    }
  } catch (err) {
    console.warn("Update check failed:", err);
    set({ status: "error" });
  }
}

export async function installUpdate() {
  if (!pending || state.status === "downloading") return;
  // Relaunching would cut off a meeting, so every caller waits for recording to end.
  if (await invoke<boolean>("is_recording").catch(() => false)) return;
  let total = 0;
  let received = 0;
  set({ status: "downloading", progress: null, manual: true });
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        received += event.data.chunkLength;
        // Only notify on whole-percent steps, not every chunk.
        const progress = total > 0 ? Math.min(Math.floor((received / total) * 100), 100) : null;
        if (progress !== state.progress) set({ progress });
      }
    });
    await relaunch();
  } catch (err) {
    console.warn("Update install failed:", err);
    set({ status: "error" });
  }
}

export function dismissUpdate() {
  set({ dismissed: true });
}

let started = false;

/** Check on launch, every few hours after, and when Help › Check for Updates… is picked. */
function startAutoCheck() {
  if (started) return;
  started = true;
  // Let startup work settle before going to the network.
  setTimeout(() => checkForUpdates(), STARTUP_DELAY_MS);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
  listen("menu-check-for-updates", () => checkForUpdates(true));
}

function subscribe(listener: () => void) {
  startAutoCheck();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdater(): UpdaterState {
  return useSyncExternalStore(subscribe, () => state);
}
