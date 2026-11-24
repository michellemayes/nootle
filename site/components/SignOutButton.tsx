"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** POSTs to a sign-out route, then reloads `then` (or the current page). */
export function SignOutButton({
  endpoint = "/api/auth/signout",
  then,
  className,
  children,
}: {
  endpoint?: string;
  then?: string;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch(endpoint, { method: "POST" });
    } finally {
      window.location.assign(then ?? window.location.href);
    }
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className={className}>
      {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
