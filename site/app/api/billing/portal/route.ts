import * as Sentry from "@sentry/nextjs";
import { getCurrentAccount } from "@/lib/account/session";
import { siteOrigin } from "@/lib/account/summary";
import { createCustomerSession, customerRefFor, polarConfigured } from "@/lib/billing/polar";

/** Sends the signed-in account to Polar's customer portal to manage billing. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = await getCurrentAccount({ device: false });
  if (!account) return Response.redirect(new URL("/signin?next=/api/billing/portal", url), 303);
  if (!polarConfigured()) return Response.redirect(new URL("/account?billing=unavailable", url), 303);

  try {
    const session = await createCustomerSession(customerRefFor(account), `${siteOrigin(request)}/account`);
    return Response.redirect(session.url, 303);
  } catch (error) {
    // Most often an account that never bought anything, so Polar has no customer for it.
    if (account.polarCustomerId) Sentry.captureException(error);
    return Response.redirect(new URL(account.polarCustomerId ? "/account?billing=unavailable" : "/pricing", url), 303);
  }
}
