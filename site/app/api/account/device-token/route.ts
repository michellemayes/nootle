import { getCurrentAccount, mintDeviceToken } from "@/lib/account/session";

export async function POST() {
  const account = await getCurrentAccount({ device: false });
  if (!account) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({ token: mintDeviceToken(account) }, { headers: { "Cache-Control": "no-store" } });
}
