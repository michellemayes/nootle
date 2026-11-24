import * as Sentry from "@sentry/nextjs";
import { productIdFor } from "@/lib/account/plans";
import { getCurrentAccount } from "@/lib/account/session";
import { isLifetime, siteOrigin } from "@/lib/account/summary";
import type { PlanInterval } from "@/lib/account/types";
import { createCheckout, customerRefFor, polarConfigured } from "@/lib/billing/polar";
import { referralFromCookie } from "@/lib/referral-offer";

const INTERVALS: PlanInterval[] = ["monthly", "yearly", "lifetime"];

/** `?plan=monthly|yearly|lifetime`: Polar's checkout, as the signed-in account and with a friend's discount when there is one. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const interval = url.searchParams.get("plan") as PlanInterval;
  if (!INTERVALS.includes(interval)) return Response.redirect(new URL("/pricing", url), 303);
  const productId = productIdFor(interval);
  if (!polarConfigured() || !productId) return Response.redirect(new URL("/pricing?unavailable=1", url), 303);

  const [account, cookieRef] = await Promise.all([getCurrentAccount({ device: false }), referralFromCookie()]);
  if (account && isLifetime(account.plan)) return Response.redirect(new URL("/account", url), 303);
  const ref = cookieRef && cookieRef !== account?.referralCode ? cookieRef : undefined;
  const firstPurchase = !account || account.processedOrders.length === 0;
  const discountId = ref && firstPurchase ? process.env.POLAR_REFERRAL_DISCOUNT_ID : undefined;

  const origin = siteOrigin(request);
  try {
    const checkout = await createCheckout({
      productId,
      customer: account ? customerRefFor(account) : undefined,
      email: account?.email,
      discountId,
      metadata: { ...(ref && { ref }), ...(account && { accountId: account.id }) },
      successUrl: `${origin}/account?welcome=1`,
      returnUrl: `${origin}/pricing`,
    });
    return Response.redirect(checkout.url, 303);
  } catch (error) {
    Sentry.captureException(error);
    return Response.redirect(new URL("/pricing?unavailable=1", url), 303);
  }
}
