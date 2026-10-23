import { openConnector } from "@/lib/mcp";
import { approve, openAuthorizeRequest, parseConnectorKey } from "@/lib/oauth";

/**
 * The sign-in form's target: checks the pasted connector key opens a
 * connector, then sends the person back to their AI app with a code.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const sealed = String(form.get("request"));
  const authorize = openAuthorizeRequest(sealed);
  const origin = new URL(request.url).origin;
  if (!authorize) return Response.redirect(new URL("/oauth/authorize?request=expired", origin), 303);

  const credential = parseConnectorKey(String(form.get("key") ?? ""));
  if (!(await openConnector(credential))) {
    const retry = new URL("/oauth/authorize", origin);
    retry.searchParams.set("request", sealed);
    retry.searchParams.set("error", "key");
    return Response.redirect(retry, 303);
  }
  return Response.redirect(approve(authorize, credential, origin), 303);
}
