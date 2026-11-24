import { getCurrentAccount, mintDeviceToken } from "@/lib/account/session";

/** A device token for the Nootle app, for a signed-in browser session. */
export async function POST() {
  const account = await getCurrentAccount({ device: false });
  if (!account) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({ token: mintDeviceToken(account) }, { headers: { "Cache-Control": "no-store" } });
}
