import { PRICES, REFERRAL_REWARD_DAYS } from "@/lib/account/plans";
import type { AccountStore } from "@/lib/account/store";
import { isLifetime, planGivesPro } from "@/lib/account/summary";
import { normalizeReferralCode, type Account, type Plan, type PlanInterval } from "@/lib/account/types";

const DAY_MS = 86_400_000;
/** Far more than any retry window needs. */
const MAX_PROCESSED_ORDERS = 200;

interface PolarCustomer {
  id: string;
  email?: string | null;
  external_id?: string | null;
}

export interface PolarSubscription {
  id: string;
  status: string;
  product_id?: string | null;
  recurring_interval?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  ends_at?: string | null;
  ended_at?: string | null;
  customer_id?: string;
  customer?: PolarCustomer;
  metadata?: Record<string, unknown>;
}

export interface PolarOrder {
  id: string;
  status?: string;
  paid?: boolean;
  total_amount?: number;
  product_id?: string | null;
  subscription_id?: string | null;
  subscription?: PolarSubscription | null;
  customer_id: string;
  customer?: PolarCustomer;
  metadata?: Record<string, unknown>;
}

export type PolarEvent =
  | { type: "order.paid"; data: PolarOrder }
  | {
      type:
        | "subscription.created"
        | "subscription.updated"
        | "subscription.active"
        | "subscription.canceled"
        | "subscription.uncanceled"
        | "subscription.revoked";
      data: PolarSubscription;
    }
  | { type: string; data: unknown };

export interface WebhookDeps {
  store: AccountStore;
  products: Record<string, PlanInterval>;
  /** Absent when Polar isn't configured. */
  extendSubscription?: (id: string, days: number) => Promise<{ renewsAt: string }>;
  now?: Date;
}

export type WebhookResult =
  | { handled: false }
  | { handled: true; accountId: string; duplicate?: boolean; rewarded?: { referrerId: string; via: "subscription" | "bonus" } };

export function productsFromEnv(env: Record<string, string | undefined> = process.env): Record<string, PlanInterval> {
  return Object.fromEntries(PRICES.flatMap(({ productEnv, interval }) => (env[productEnv] ? [[env[productEnv], interval]] : [])));
}

const metaString = (meta: Record<string, unknown> | undefined, key: string) =>
  typeof meta?.[key] === "string" ? (meta[key] as string) : undefined;

/** Creates an account for a guest checkout. */
async function accountFor(
  store: AccountStore,
  customer: PolarCustomer | undefined,
  customerId: string | undefined,
  metadata: Record<string, unknown> | undefined,
): Promise<Account | null> {
  const found =
    (customer?.external_id && (await store.getAccount(customer.external_id))) ||
    (metaString(metadata, "accountId") && (await store.getAccount(metaString(metadata, "accountId")!))) ||
    (customerId && (await store.findByPolarCustomer(customerId))) ||
    (customer?.email && (await store.findByEmail(customer.email))) ||
    null;
  const account =
    found ||
    (customer?.email
      ? await store.createAccount({ email: customer.email, referredBy: validRef(metaString(metadata, "ref")) })
      : null);
  if (account && customerId && !account.polarCustomerId) account.polarCustomerId = customerId;
  return account;
}

const validRef = (ref: string | undefined) => normalizeReferralCode(ref) ?? undefined;

function intervalOf(sub: PolarSubscription, products: Record<string, PlanInterval>): PlanInterval {
  const known = sub.product_id ? products[sub.product_id] : undefined;
  if (known && known !== "lifetime") return known;
  return sub.recurring_interval === "year" ? "yearly" : "monthly";
}

/** Null for a subscription that never started (incomplete). */
export function planFromSubscription(sub: PolarSubscription, products: Record<string, PlanInterval>): Plan | null {
  const base = { tier: "pro" as const, interval: intervalOf(sub, products), subscriptionId: sub.id };
  const periodEnd = sub.current_period_end ?? undefined;
  switch (sub.status) {
    case "active":
    case "trialing":
      return sub.cancel_at_period_end
        ? { ...base, status: "canceled", endsAt: sub.ends_at ?? periodEnd }
        : { ...base, status: sub.status, renewsAt: periodEnd };
    case "past_due":
      return { ...base, status: "past_due", renewsAt: periodEnd };
    case "canceled":
      return { ...base, status: "canceled", endsAt: sub.ended_at ?? sub.ends_at ?? periodEnd };
    case "unpaid":
    case "incomplete_expired":
      return { ...base, status: "revoked" };
    default:
      return null;
  }
}

function applySubscription(account: Account, sub: PolarSubscription, revoked: boolean, deps: WebhookDeps, now: Date) {
  if (isLifetime(account.plan)) return;
  const plan: Plan | null = revoked
    ? { tier: "pro", interval: intervalOf(sub, deps.products), subscriptionId: sub.id, status: "revoked" }
    : planFromSubscription(sub, deps.products);
  if (!plan) return;
  // An old subscription ending mustn't take Pro away from a newer one.
  const current = account.plan;
  const t = now.getTime();
  if (current.subscriptionId && current.subscriptionId !== sub.id && planGivesPro(current, t) && !planGivesPro(plan, t)) return;
  account.plan = plan;
}

const latest = (...dates: (string | undefined | null)[]) =>
  Math.max(...dates.map((d) => (d ? Date.parse(d) : 0)).filter((t) => !Number.isNaN(t)));

/** A later renewal if the referrer subscribes, else bonus days. */
async function reward(referrer: Account, deps: WebhookDeps, now: Date): Promise<"subscription" | "bonus"> {
  const plan = referrer.plan;
  if (
    deps.extendSubscription &&
    plan.subscriptionId &&
    plan.interval !== "lifetime" &&
    (plan.status === "active" || plan.status === "trialing")
  ) {
    try {
      const { renewsAt } = await deps.extendSubscription(plan.subscriptionId, REFERRAL_REWARD_DAYS);
      referrer.plan = { ...plan, renewsAt };
      return "subscription";
    } catch {
      // Polar refused (e.g. the subscription just ended): bonus days instead.
    }
  }
  const planEnd = planGivesPro(plan, now.getTime()) ? (plan.endsAt ?? plan.renewsAt) : undefined;
  const from = latest(now.toISOString(), referrer.bonusProUntil, planEnd);
  referrer.bonusProUntil = new Date(from + REFERRAL_REWARD_DAYS * DAY_MS).toISOString();
  return "bonus";
}

async function applyOrder(order: PolarOrder, deps: WebhookDeps, now: Date): Promise<WebhookResult> {
  const { store } = deps;
  const account = await accountFor(store, order.customer, order.customer_id, order.metadata);
  if (!account) return { handled: false };
  if (account.processedOrders.includes(order.id)) return { handled: true, accountId: account.id, duplicate: true };

  if (order.product_id && deps.products[order.product_id] === "lifetime") {
    account.plan = { tier: "pro", interval: "lifetime", status: "active" };
  } else if (order.subscription) {
    applySubscription(account, { product_id: order.product_id, ...order.subscription }, false, deps, now);
  }

  const ref = validRef(metaString(order.metadata, "ref"));
  if (!account.referredBy && ref && ref !== account.referralCode) account.referredBy = ref;

  let rewarded: { referrerId: string; via: "subscription" | "bonus" } | undefined;
  const referrer =
    (order.total_amount ?? 0) > 0 && account.referredBy && !account.referrerRewarded
      ? await store.findByReferralCode(account.referredBy)
      : null;
  if (referrer && referrer.id !== account.id) {
    let entry = referrer.referrals.find((r) => r.accountId === account.id);
    if (!entry) {
      entry = { accountId: account.id, joinedAt: now.toISOString() };
      referrer.referrals.push(entry);
    }
    if (!entry.paidAt) {
      entry.paidAt = now.toISOString();
      rewarded = { referrerId: referrer.id, via: await reward(referrer, deps, now) };
    }
    account.referrerRewarded = true;
  }

  account.processedOrders = [...account.processedOrders, order.id].slice(-MAX_PROCESSED_ORDERS);
  await Promise.all([store.saveAccount(account), rewarded && referrer ? store.saveAccount(referrer) : null]);
  return { handled: true, accountId: account.id, rewarded };
}

/** Unknown events are ignored. */
export async function applyEvent(event: PolarEvent, deps: WebhookDeps): Promise<WebhookResult> {
  const now = deps.now ?? new Date();
  if (event.type === "order.paid") return applyOrder(event.data as PolarOrder, deps, now);
  if (!event.type.startsWith("subscription.")) return { handled: false };
  const handled = ["created", "updated", "active", "canceled", "uncanceled", "revoked"];
  const kind = event.type.slice("subscription.".length);
  if (!handled.includes(kind)) return { handled: false };

  const sub = event.data as PolarSubscription;
  const account = await accountFor(deps.store, sub.customer, sub.customer_id, sub.metadata);
  if (!account) return { handled: false };
  applySubscription(account, sub, kind === "revoked", deps, now);
  await deps.store.saveAccount(account);
  return { handled: true, accountId: account.id };
}
