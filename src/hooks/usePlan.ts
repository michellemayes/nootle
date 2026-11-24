import { useCallback, useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "@/components/Toaster";
import { useBooleanSetting } from "@/hooks/useBooleanSetting";
import { PRICING_URL, type PlanInterval, type ProFeatureId } from "@/lib/plan";
import type { AccountStatus } from "@/types";

// One status for the whole window, so every gate on a page shares a fetch.
let current: AccountStatus | null = null;
const subscribers = new Set<() => void>();
let started = false;

function publish(status: AccountStatus) {
  current = status;
  subscribers.forEach((notify) => notify());
}

function reload() {
  return invoke<AccountStatus>("account_status")
    .then(publish)
    .catch(() => {});
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (!started) {
    started = true;
    listen("account-changed", reload);
    reload();
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
    openUrl(PRICING_URL).catch(() => {});
  }
}

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

const actions = {
  signIn: () =>
    invoke("account_begin_sign_in").catch((err) => {
      toast(`Couldn't open sign-in: ${err}`);
    }),
  refresh: () => invoke<AccountStatus>("account_refresh").then(publish),
  signOut: () => invoke("account_sign_out").then(reload),
  checkout: (plan: PlanInterval) => invoke("account_open_checkout", { plan }),
  openBilling: () => invoke("account_open_billing"),
};

/** Until the first answer arrives, `pro` is true so Pro features don't flash an upsell on the way in. */
export function usePlan() {
  const status = useSyncExternalStore(subscribe, () => current);
  return { status, pro: status?.pro ?? true, actions };
}

/** A Pro feature's on/off setting: off while locked, and turning it on opens the upgrade dialog instead. */
export function useProSetting(key: string, feature: ProFeatureId) {
  const [on, set] = useBooleanSetting(key, false);
  const { pro } = usePlan();
  const guarded = useCallback(
    (next: boolean) => (next && !pro ? openUpgrade(feature) : set(next)),
    [pro, feature, set],
  );
  return [on && pro, guarded, !pro] as const;
}

export function useProAction<A extends unknown[]>(feature: ProFeatureId, fn: (...args: A) => unknown) {
  const { pro } = usePlan();
  const run = (...args: A) => (pro ? fn(...args) : openUpgrade(feature));
  return [run, !pro] as const;
}
