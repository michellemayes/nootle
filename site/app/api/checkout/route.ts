import * as Sentry from "@sentry/nextjs";
import { productIdFor } from "@/lib/account/plans";
import { getCurrentAccount, getReferralCookie } from "@/lib/account/session";
import { siteOrigin } from "@/lib/account/summary";
import type { PlanInterval } from "@/lib/account/types";
import { createCheckout, polarConfigured } from "@/lib/billing/polar";

const INTERVALS: PlanInterval[] = ["monthly", "yearly", "lifetime"];

/**
 * `?plan=monthly|yearly|lifetime`: sends the visitor to Polar's checkout, as
 * their account when signed in, with the referral discount when a friend's
 * code is in the cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const interval = url.searchParams.get("plan") as PlanInterval;
  if (!INTERVALS.includes(interval)) return Response.redirect(new URL("/pricing", url), 303);
  const productId = productIdFor(interval);
  if (!polarConfigured() || !productId) return Response.redirect(new URL("/pricing?unavailable=1", url), 303);

  const account = await getCurrentAccount({ device: false });
  if (account?.plan.interval === "lifetime" && account.plan.status === "active") {
    return Response.redirect(new URL("/account", url), 303);
  }
  const cookieRef = await getReferralCookie();
  const ref = cookieRef && cookieRef !== account?.referralCode ? cookieRef : undefined;
  const firstPurchase = !account || account.processedOrders.length === 0;
  const discountId = ref && firstPurchase ? process.env.POLAR_REFERRAL_DISCOUNT_ID : undefined;

  const origin = siteOrigin(request);
  try {
    const checkout = await createCheckout({
      productId,
      customer: account
        ? account.polarCustomerId
          ? { customerId: account.polarCustomerId }
          : { externalCustomerId: account.id }
        : undefined,
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
