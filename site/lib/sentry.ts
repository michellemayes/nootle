// Shared Sentry options for the browser, Node and Edge runtimes. Errors
// only: no tracing, replays or breadcrumbs, and nothing that could carry a
// shared note, an MCP credential or a visitor's identity.

import type { ErrorEvent } from "@sentry/nextjs";
import { isSharePage } from "@/lib/share-page";

/** Paths whose segments are secrets or ids: share links and their key, MCP credentials. */
const SECRET_SEGMENTS: [RegExp, string][] = [
  [/\/s\/[^/?#]+/g, "/s/[id]"],
  [/\/mcp\/[^/?#]+/g, "/mcp/[credential]"],
  [/\/api\/(shares|connectors)\/[^/?#]+/g, "/api/$1/[id]"],
];

/** A URL or path without its query, fragment (a share's key lives there) or secret segments. */
export function redactUrl(url: string): string {
  const bare = url.split(/[?#]/, 1)[0];
  return SECRET_SEGMENTS.reduce((u, [pattern, replacement]) => u.replace(pattern, replacement), bare);
}

/** The path an event came from: the page in the browser, the request or route ("GET /s/[id]") on the server. */
function eventPath(event: ErrorEvent): string | undefined {
  if (typeof location !== "undefined") return location.pathname;
  const url = event.request?.url;
  if (url) return new URL(url, "http://localhost").pathname;
  return event.transaction?.split(" ").pop();
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  const path = eventPath(event);
  if (path && isSharePage(path)) return null;
  if (event.request) {
    event.request = { url: event.request.url && redactUrl(event.request.url), method: event.request.method };
  }
  if (event.transaction) event.transaction = redactUrl(event.transaction);
  delete event.user;
  delete event.server_name;
  return event;
}

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend: scrubEvent,
};
