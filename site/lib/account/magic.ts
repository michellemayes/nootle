import { open, seal } from "@/lib/account/seal";
import { normalizeEmail } from "@/lib/account/store";

const MAGIC_LINK_SECONDS = 15 * 60;

export interface MagicLink {
  email: string;
  next?: string;
  /** The Nootle app's sign-in state, when the link connects the app. */
  appState?: string;
}

const EMAIL = /^[^\s@"<>()[\]\\,;:]+@[^\s@"<>()[\]\\,;:]+\.[^\s@"<>()[\]\\,;:]{2,}$/;
const APP_STATE = /^[A-Za-z0-9_-]{16,128}$/;

export const isEmail = (email: unknown): email is string =>
  typeof email === "string" && email.length <= 254 && EMAIL.test(email.trim());

export const isAppState = (state: unknown): state is string => typeof state === "string" && APP_STATE.test(state);

/** A same-site path (no `//host` or `/\host` tricks), or undefined. */
export function safeNext(next: unknown): string | undefined {
  if (typeof next !== "string" || next.length > 512 || !next.startsWith("/") || /^\/[/\\]/.test(next)) return undefined;
  return [...next].some((c) => c < " " || c === "\\") ? undefined : next;
}

export function parseMagicRequest(body: unknown): MagicLink | null {
  const { email, next, appState } = (body ?? {}) as Record<string, unknown>;
  if (!isEmail(email)) return null;
  if (appState !== undefined && !isAppState(appState)) return null;
  return { email: normalizeEmail(email), next: safeNext(next), appState };
}

export const sealMagicLink = (link: MagicLink) => seal("magic", link, MAGIC_LINK_SECONDS);
export const openMagicLink = (token: unknown) => open<MagicLink>("magic", token);
