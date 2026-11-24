import { clearSessionCookie, isFormPost } from "@/lib/account/session";

/** Signs this browser out. A form post is sent home; a fetch gets 204. */
export async function POST(request: Request) {
  await clearSessionCookie();
  return isFormPost(request) ? Response.redirect(new URL("/", request.url), 303) : new Response(null, { status: 204 });
}
