import { openMagicLink } from "@/lib/account/magic";
import { getReferralCookie, setSessionCookie } from "@/lib/account/session";
import { createAccount } from "@/lib/account/store";

/**
 * Where a sign-in link lands: signs the browser in, creating the account
 * the first time (with the referral cookie's code), then sends it on.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const magic = openMagicLink(url.searchParams.get("token"));
  if (!magic) return Response.redirect(new URL("/signin?error=expired", url), 303);

  const account = await createAccount({ email: magic.email, referredBy: await getReferralCookie() });
  await setSessionCookie(account);

  const target = magic.appState
    ? `/signin/app?state=${encodeURIComponent(magic.appState)}`
    : (magic.next ?? "/account");
  return Response.redirect(new URL(target, url), 303);
}
