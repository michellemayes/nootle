import { getCurrentAccount } from "@/lib/account/session";
import { siteOrigin, summarize } from "@/lib/account/summary";

const NO_STORE = { "Cache-Control": "no-store" };

/** The signed-in account's plan and referrals, by session cookie or the Nootle app's device token. */
export async function GET(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return Response.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  return Response.json(summarize(account, siteOrigin(request)), { headers: NO_STORE });
}
