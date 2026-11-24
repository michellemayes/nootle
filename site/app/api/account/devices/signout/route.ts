import { getCurrentAccount, isFormPost, setSessionCookie } from "@/lib/account/session";
import { saveAccount } from "@/lib/account/store";

/** Signs every connected Mac out by revoking their device tokens. This browser stays signed in. */
export async function POST(request: Request) {
  const account = await getCurrentAccount({ device: false });
  if (!account) return Response.json({ error: "Sign in first" }, { status: 401 });
  account.deviceVersion += 1;
  await saveAccount(account);
  await setSessionCookie(account);
  return isFormPost(request)
    ? Response.redirect(new URL("/account?signedOutDevices=1", request.url), 303)
    : new Response(null, { status: 204 });
}
