const APP_STATE = /^[A-Za-z0-9_-]{16,64}$/;

type Param = string | string[] | undefined;

const one = (value: Param) => (Array.isArray(value) ? value[0] : value);

/** The Mac app's sign-in state, when it's well formed. */
export const appState = (value: Param) => {
  const state = one(value);
  return state && APP_STATE.test(state) ? state : undefined;
};

/** A same-site path to return to after signing in. */
export const safeNext = (value: Param) => {
  const next = one(value);
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : undefined;
};

export const SIGNIN_STORAGE_KEY = "nootle-signin";

export interface PendingSignIn {
  email: string;
  next?: string;
  appState?: string;
  devLink?: string;
  sentAt: number;
}
