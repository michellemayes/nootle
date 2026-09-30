"use client";

import { useEffect, useSyncExternalStore } from "react";

// Integrations (Slack, Notion, Confluence, GitHub, Linear, Asana) redirect
// here after sign-in. The page forwards the query string, which carries the
// one-time code and the app's `state`, to the Nootle desktop app. Nothing is
// sent to a server; the code is useless without the app's PKCE verifier or
// client secret.
const APP_CALLBACK = "nootle://oauth/callback";

// Read once when the module loads, before the effect below strips the code
// from the address bar.
const initialQuery = typeof window === "undefined" ? "" : window.location.search;
const subscribe = () => () => {};

export default function OAuthCallbackPage() {
  const query = useSyncExternalStore(subscribe, () => initialQuery, () => "");
  const appUrl = query ? `${APP_CALLBACK}${query}` : null;
  const failed = new URLSearchParams(query).has("error");

  useEffect(() => {
    if (!appUrl) return;
    // Drop the code from the address bar and history once it's been read.
    window.history.replaceState(null, "", window.location.pathname);
    window.location.replace(appUrl);
  }, [appUrl]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="font-[family-name:var(--font-outfit)] text-3xl font-bold text-[var(--color-text)]">
          {failed ? "Sign-in didn’t complete" : "Returning to Nootle…"}
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          {failed
            ? "Nootle will show what went wrong. You can close this tab."
            : "If your browser asks, allow it to open Nootle. You can close this tab once Nootle shows the integration as connected."}
        </p>
        {appUrl && (
          <a
            href={appUrl}
            className="inline-block rounded-full px-5 py-2 bg-[var(--color-accent)] text-white font-medium"
          >
            Open Nootle
          </a>
        )}
      </div>
    </main>
  );
}
