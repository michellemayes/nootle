import { getCurrentAccount, setSessionCookie } from "@/lib/account/session";
import { saveAccount } from "@/lib/account/store";

/** Signs every connected Mac out by revoking their device tokens. This browser stays signed in. */
export async function POST() {
  const account = await getCurrentAccount({ device: false });
  if (!account) return Response.json({ error: "Sign in first" }, { status: 401 });
  account.deviceVersion += 1;
  await saveAccount(account);
  await setSessionCookie(account);
  return new Response(null, { status: 204 });
}
