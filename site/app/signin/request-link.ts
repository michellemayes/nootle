const SIGNIN_STORAGE_KEY = "nootle-signin";

export interface PendingSignIn {
  email: string;
  next?: string;
  appState?: string;
  devLink?: string;
  sentAt: number;
}

type Result = { ok: true; devLink?: string } | { ok: false; error: string };

export async function requestLink({ email, next, appState }: Omit<PendingSignIn, "sentAt" | "devLink">): Promise<Result> {
  try {
    const resp = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next, appState }),
    });
    if (resp.status === 429) return { ok: false, error: "We just sent one. Give it a few seconds before asking again." };
    if (resp.status === 400) return { ok: false, error: "That doesn't look like an email address." };
    if (!resp.ok) return { ok: false, error: "Couldn't send the link. Try again in a moment." };
    const body = (await resp.json().catch(() => ({}))) as { devLink?: string };
    return { ok: true, devLink: body.devLink };
  } catch {
    return { ok: false, error: "Couldn't reach nootle.ai. Check your connection and try again." };
  }
}

export function savePending(pending: PendingSignIn) {
  try {
    sessionStorage.setItem(SIGNIN_STORAGE_KEY, JSON.stringify(pending));
  } catch {}
}

export function readPending(): PendingSignIn | null {
  try {
    return JSON.parse(sessionStorage.getItem(SIGNIN_STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}
