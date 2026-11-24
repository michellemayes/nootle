import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PlanInterval, ProFeatureId } from "@/lib/plan";
import type { AccountStatus } from "@/types";

// One status for the whole window, so every gate on a page shares a fetch.
let current: AccountStatus | null = null;
const subscribers = new Set<() => void>();
let unlisten: Promise<() => void> | null = null;

function publish(status: AccountStatus) {
  current = status;
  subscribers.forEach((notify) => notify());
}

export function reloadPlan() {
  return invoke<AccountStatus>("account_status")
    .then(publish)
    .catch(() => {});
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (!unlisten) {
    unlisten = listen("account-changed", () => reloadPlan());
    reloadPlan();
  }
  return () => {
    subscribers.delete(notify);
  };
}

const UPGRADE_EVENT = "nootle:open-upgrade";
let upgradeDialogMounted = 0;

/** Opens the upgrade dialog, or the pricing page in windows without one. */
export function openUpgrade(feature?: ProFeatureId) {
  if (upgradeDialogMounted > 0) {
    window.dispatchEvent(new CustomEvent(UPGRADE_EVENT, { detail: feature }));
  } else {
    openUrl("https://nootle.ai/pricing").catch(() => {});
  }
}

/** For UpgradeDialog: calls `onOpen` whenever something asks to upgrade. */
export function useUpgradeRequests(onOpen: (feature?: ProFeatureId) => void) {
  useEffect(() => {
    upgradeDialogMounted++;
    const handler = (e: Event) => onOpen((e as CustomEvent<ProFeatureId | undefined>).detail);
    window.addEventListener(UPGRADE_EVENT, handler);
    return () => {
      upgradeDialogMounted--;
      window.removeEventListener(UPGRADE_EVENT, handler);
    };
  }, [onOpen]);
}

export const planActions = {
  signIn: () => invoke("account_begin_sign_in"),
  refresh: () => invoke<AccountStatus>("account_refresh").then(publish),
  signOut: () => invoke("account_sign_out").then(reloadPlan),
  checkout: (plan: PlanInterval) => invoke("account_open_checkout", { plan }),
  openBilling: () => invoke("account_open_billing"),
};

/**
 * The account and plan. Until the first answer arrives, `pro` is true so Pro
 * features don't flash an upsell on the way in.
 */
export function usePlan() {
  const status = useSyncExternalStore(subscribe, () => current);
  return { status, pro: status?.pro ?? true, ...planActions };
}
