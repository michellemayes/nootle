export type PlanInterval = "monthly" | "yearly" | "lifetime";
export type PlanStatus = "active" | "trialing" | "past_due" | "canceled" | "revoked";

export interface Plan {
  tier: "free" | "pro";
  interval?: PlanInterval;
  status?: PlanStatus;
  renewsAt?: string;
  /** When a canceled subscription stops giving Pro. */
  endsAt?: string;
  subscriptionId?: string;
}

export interface Referral {
  accountId: string;
  joinedAt: string;
  paidAt?: string;
}

export interface Account {
  id: string;
  /** Lowercased. */
  email: string;
  createdAt: string;
  referralCode: string;
  referredBy?: string;
  /** Set once the referrer got their reward for this account, so later orders skip looking them up. */
  referrerRewarded?: boolean;
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

/** GET /api/account, which the Nootle app reads too. */
export interface AccountSummary {
  email: string;
  plan: Plan;
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
export const REFERRAL_COOKIE = "nootle_ref";
export const SESSION_COOKIE = "nootle_session";

export const MAGIC_LINK_COOLDOWN_SECONDS = 30;

export function normalizeReferralCode(code: string | undefined): string | null {
  const upper = (code ?? "").trim().toUpperCase();
  return REFERRAL_CODE.test(upper) ? upper : null;
}
