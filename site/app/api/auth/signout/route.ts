import { clearSessionCookie } from "@/lib/account/session";

export async function POST() {
  await clearSessionCookie();
  return new Response(null, { status: 204 });
}
