import * as Sentry from "@sentry/nextjs";
import { emailConfigured, sendMagicLink } from "@/lib/account/email";
import { parseMagicRequest, sealMagicLink } from "@/lib/account/magic";
import { defaultStore } from "@/lib/account/store";
import { siteOrigin } from "@/lib/account/summary";
import { MAGIC_LINK_COOLDOWN_SECONDS } from "@/lib/account/types";

/** Emails a sign-in link for `{ email, next?, appState? }`, or answers `{ devLink }` in dev without Resend. */
export async function POST(request: Request) {
  const magic = parseMagicRequest(await request.json().catch(() => null));
  if (!magic) return Response.json({ error: "Enter a valid email address" }, { status: 400 });

  const store = defaultStore();
  const sentAt = await store.magicLinkSentAt(magic.email);
  const wait = sentAt === null ? 0 : sentAt + MAGIC_LINK_COOLDOWN_SECONDS * 1000 - Date.now();
  if (wait > 0) {
    return Response.json(
      { error: "We just sent you a link. Try again in a few seconds." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  const link = `${siteOrigin(request)}/api/auth/verify?token=${sealMagicLink(magic)}`;
  if (!emailConfigured() && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Email sign-in isn't set up" }, { status: 503 });
  }
  await store.markMagicLinkSent(magic.email);
  if (!emailConfigured()) return Response.json({ devLink: link });
  try {
    await sendMagicLink(magic.email, link);
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: "We couldn't send the email. Try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
