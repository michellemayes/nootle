import type { Metadata } from "next";
import { parseAuthorizeRequest, sealAuthorizeRequest } from "@/lib/oauth";

export const metadata: Metadata = {
  title: "Connect to Nootle",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where an AI app sends someone to connect Nootle: they paste the connector
 * key from their own Nootle app, so each person reaches their own meetings.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const request = parseAuthorizeRequest(params);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 space-y-6">
        <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-bold text-[var(--color-text)]">
          Connect to Nootle
        </h1>
        {typeof request === "string" ? (
          <p className="text-[var(--color-text-secondary)]">{request} Try connecting again from the app.</p>
        ) : (
          <form method="post" action="/api/oauth/approve" className="space-y-5">
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="text-[var(--color-text)]">{request.client_name || "An AI app"}</strong> wants to read the meetings you&apos;ve
              shared from Nootle and ticked <em>Let AI connectors read this</em>. It can&apos;t change anything.
            </p>
            <input type="hidden" name="request" value={sealAuthorizeRequest(request)} />
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--color-text)]">Your connector key</span>
              <input
                name="key"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste it from Nootle"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </label>
            {params.error === "key" && (
              <p role="alert" className="text-sm text-[var(--color-sponsor)]">
                That key doesn&apos;t open a connector. Copy it again; if you reset the connector, use the new one.
              </p>
            )}
            <p className="text-sm text-[var(--color-text-secondary)]">
              In the Nootle app, open Settings → Integrations → AI connector and click <em>Copy key</em>. Each person
              uses their own key, so they only see their own meetings.
            </p>
            <button
              type="submit"
              className="w-full rounded-full bg-[var(--color-accent)] px-6 py-3 font-semibold text-white hover:bg-[var(--color-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Connect
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
