import { useEffect, useSyncExternalStore } from "react";

let hidden = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setHidden(next: boolean) {
  hidden = next;
  listeners.forEach((l) => l());
}

/** Hide the floating "Ask across meetings" button while `active` is true. */
export function useHideChatButton(active: boolean) {
  useEffect(() => {
    if (!active) return;
    setHidden(true);
    return () => setHidden(false);
  }, [active]);
}

/** True while a panel (e.g. a meeting's Ask Nootle) has hidden the button. */
export function useChatButtonHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hidden);
}
