import type { Account, AccountSummary, Plan } from "@/lib/account/types";

export const SITE_ORIGIN = "https://nootle.ai";

/**
 * Where links we hand out point: always nootle.ai in production, so a forged
 * Host header can't redirect them, and the request's own origin elsewhere.
 */
export function siteOrigin(from: Request | Headers): string {
  if (process.env.VERCEL_ENV === "production") return SITE_ORIGIN;
  if (from instanceof Request) return new URL(from.url).origin;
  const host = from.get("x-forwarded-host") ?? from.get("host") ?? "localhost";
  const proto = from.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const future = (iso: string | undefined, now: number) => (iso && Date.parse(iso) > now ? iso : null);

export const isLifetime = (plan: Plan) => plan.tier === "pro" && plan.interval === "lifetime" && plan.status === "active";

/** Whether the plan itself gives Pro, ignoring any referral bonus. */
export function planGivesPro(plan: Plan, now = Date.now()): boolean {
  if (plan.tier !== "pro") return false;
  switch (plan.status) {
    case "active":
    case "trialing":
    case "past_due":
      return true;
    case "canceled":
      return future(plan.endsAt, now) !== null;
    default:
      return false;
  }
}

const renewing = (plan: Plan, now: number) =>
  planGivesPro(plan, now) && (plan.interval === "lifetime" || plan.status !== "canceled");

export function isPro(account: Account, now = Date.now()): boolean {
  return planGivesPro(account.plan, now) || future(account.bonusProUntil, now) !== null;
}

export function summarize(account: Account, origin = SITE_ORIGIN, now = Date.now()): AccountSummary {
  const bonus = future(account.bonusProUntil, now);
  const planEnd = planGivesPro(account.plan, now) ? future(account.plan.endsAt, now) : null;
  const ends = [bonus, planEnd].filter((d): d is string => d !== null).sort((a, b) => Date.parse(b) - Date.parse(a));
  const paid = account.referrals.filter((r) => r.paidAt).length;
  return {
    email: account.email,
    plan: account.plan,
    pro: isPro(account, now),
    proUntil: renewing(account.plan, now) ? null : (ends[0] ?? null),
    bonusProUntil: bonus,
    referral: {
      code: account.referralCode,
      url: `${origin}/r/${account.referralCode}`,
      joined: account.referrals.length,
      paid,
      monthsEarned: paid,
    },
    manageUrl: `${origin}/account`,
  };
}
