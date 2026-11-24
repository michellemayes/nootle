import { isAppState, safeNext } from "@/lib/account/magic";

type Param = string | string[] | undefined;

const one = (value: Param) => (Array.isArray(value) ? value[0] : value);

export const appState = (value: Param) => {
  const state = one(value);
  return isAppState(state) ? state : undefined;
};

export const nextPath = (value: Param) => safeNext(one(value));
