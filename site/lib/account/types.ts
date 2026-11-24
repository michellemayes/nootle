// The shapes nootle.ai's accounts, billing and referrals share between the
// API routes, the pages and the Nootle app (see docs/plans/2026-11-24-paid-plans.md).

export type PlanInterval = "monthly" | "yearly" | "lifetime";
export type PlanStatus = "active" | "trialing" | "past_due" | "canceled" | "revoked";

/** What the account has bought. `tier: "free"` with no other fields means nothing. */
export interface Plan {
  tier: "free" | "pro";
  interval?: PlanInterval;
  status?: PlanStatus;
  /** When an active subscription next bills. */
  renewsAt?: string;
  /** When a canceled subscription stops giving Pro. */
  endsAt?: string;
  subscriptionId?: string;
}

export interface Referral {
  accountId: string;
  joinedAt: string;
  /** Set on the referred account's first paid order. */
  paidAt?: string;
}

export interface Account {
  id: string;
  /** Lowercased. */
  email: string;
  createdAt: string;
  /** 8 characters from REFERRAL_ALPHABET; its link is /r/<code>. */
  referralCode: string;
  /** The referral code this account signed up or bought with. */
  referredBy?: string;
  polarCustomerId?: string;
  plan: Plan;
  /** Pro earned through referrals, on top of any plan. */
  bonusProUntil?: string;
  referrals: Referral[];
  /** Polar order ids already counted, so a retried webhook changes nothing. */
  processedOrders: string[];
  /** Bumped to sign every connected Mac out. */
  deviceVersion: number;
}

/** GET /api/account: what the app and the account page show. */
export interface AccountSummary {
  email: string;
  plan: Plan;
  /** Whether Pro is on right now, from the plan or referral bonus. */
  pro: boolean;
  /** When Pro ends if nothing renews; null for lifetime or an active subscription. */
  proUntil: string | null;
  bonusProUntil: string | null;
  referral: {
    code: string;
    url: string;
    joined: number;
    paid: number;
    monthsEarned: number;
  };
  manageUrl: string;
}

/** Unambiguous: no 0/O, 1/I/L. */
export const REFERRAL_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
/** The cookie /r/<code> sets, read at sign-up and checkout. */
export const REFERRAL_COOKIE = "nootle_ref";
export const SESSION_COOKIE = "nootle_session";
