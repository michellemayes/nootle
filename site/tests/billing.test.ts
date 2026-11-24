import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { accountStore, type AccountStore } from "@/lib/account/store";
import { summarize } from "@/lib/account/summary";
import { REFERRAL_CODE } from "@/lib/account/types";
import { verifyWebhook } from "@/lib/billing/polar";
import { applyEvent, productsFromEnv, type PolarOrder, type PolarSubscription, type WebhookDeps } from "@/lib/billing/webhook";
import { memoryKV } from "@/lib/kv";
import { sealer } from "@/lib/seal";
import { parseShareMeta } from "@/lib/shares";

const DAY = 86_400_000;
const NOW = new Date("2026-12-01T12:00:00Z");
const products = { "prod-monthly": "monthly", "prod-yearly": "yearly", "prod-lifetime": "lifetime" } as const;

function setup(extend?: WebhookDeps["extendSubscription"]) {
  const store = accountStore(memoryKV());
  const deps: WebhookDeps = { store, products: { ...products }, extendSubscription: extend, now: NOW };
  return { store, deps };
}

const order = (over: Partial<PolarOrder> & { email?: string; externalId?: string }): PolarOrder => ({
  id: over.id ?? "order-1",
  status: "paid",
  paid: true,
  total_amount: 3500,
  product_id: "prod-yearly",
  customer_id: over.customer_id ?? "cust-1",
  customer: { id: over.customer_id ?? "cust-1", email: over.email ?? "friend@example.com", external_id: over.externalId ?? null },
  metadata: {},
  ...over,
});

const subscription = (over: Partial<PolarSubscription> = {}): PolarSubscription => ({
  id: "sub-1",
  status: "active",
  product_id: "prod-monthly",
  recurring_interval: "month",
  current_period_end: "2027-01-01T00:00:00.000Z",
  cancel_at_period_end: false,
  customer_id: "cust-1",
  customer: { id: "cust-1", email: "buyer@example.com", external_id: null },
  ...over,
});

async function referred(store: AccountStore) {
  const referrer = await store.createAccount({ email: "Referrer@Example.com" });
  const friend = await store.createAccount({ email: "friend@example.com", referredBy: referrer.referralCode });
  return { referrer, friend };
}

describe("account store", () => {
  it("creates accounts with unique codes and finds them every way", async () => {
    const store = accountStore(memoryKV());
    const a = await store.createAccount({ email: " Someone@Example.com " });
    assert.equal(a.email, "someone@example.com");
    assert.match(a.referralCode, REFERRAL_CODE);
    assert.equal((await store.findByEmail("SOMEONE@example.com"))?.id, a.id);
    assert.equal((await store.findByReferralCode(a.referralCode))?.id, a.id);
    assert.equal((await store.createAccount({ email: "someone@example.com" })).id, a.id);
    a.polarCustomerId = "cust-9";
    await store.saveAccount(a);
    assert.equal((await store.findByPolarCustomer("cust-9"))?.id, a.id);
    assert.equal(await store.getAccount("../etc/passwd"), null);
    assert.equal(await store.referralCodeExists(a.referralCode), true);
    assert.equal(await store.referralCodeExists("ABCDEFGH"), false);
  });

  it("records referrals and drops unknown codes", async () => {
    const store = accountStore(memoryKV());
    const { referrer, friend } = await referred(store);
    assert.equal(friend.referredBy, referrer.referralCode);
    assert.equal((await store.getAccount(referrer.id))?.referrals.length, 1);
    const stray = await store.createAccount({ email: "x@example.com", referredBy: "ABCDEFGH" });
    assert.equal(stray.referredBy, undefined);
  });
});

describe("webhook", () => {
  it("maps subscription events to the plan", async () => {
    const { store, deps } = setup();
    const result = await applyEvent({ type: "subscription.active", data: subscription() }, deps);
    assert.ok(result.handled);
    const account = (await store.findByEmail("buyer@example.com"))!;
    assert.deepEqual(account.plan, {
      tier: "pro",
      interval: "monthly",
      subscriptionId: "sub-1",
      status: "active",
      renewsAt: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(account.polarCustomerId, "cust-1");

    await applyEvent({ type: "subscription.canceled", data: subscription({ cancel_at_period_end: true, ends_at: "2027-01-01T00:00:00.000Z" }) }, deps);
    let plan = (await store.getAccount(account.id))!.plan;
    assert.equal(plan.status, "canceled");
    assert.equal(plan.endsAt, "2027-01-01T00:00:00.000Z");
    assert.equal(summarize((await store.getAccount(account.id))!, undefined, NOW.getTime()).pro, true);

    await applyEvent({ type: "subscription.uncanceled", data: subscription() }, deps);
    assert.equal((await store.getAccount(account.id))!.plan.status, "active");

    await applyEvent({ type: "subscription.revoked", data: subscription({ status: "canceled" }) }, deps);
    plan = (await store.getAccount(account.id))!.plan;
    assert.equal(plan.status, "revoked");
    assert.equal(summarize((await store.getAccount(account.id))!, undefined, NOW.getTime()).pro, false);
  });

  it("finds the account by external id before email", async () => {
    const { store, deps } = setup();
    const account = await store.createAccount({ email: "me@example.com" });
    await applyEvent(
      { type: "subscription.created", data: subscription({ customer: { id: "cust-1", email: "other@example.com", external_id: account.id } }) },
      deps,
    );
    assert.equal((await store.getAccount(account.id))!.plan.tier, "pro");
    assert.equal(await store.findByEmail("other@example.com"), null);
  });

  it("gives lifetime on a lifetime order, which later subscription events don't undo", async () => {
    const { store, deps } = setup();
    await applyEvent({ type: "order.paid", data: order({ product_id: "prod-lifetime", email: "life@example.com" }) }, deps);
    const account = (await store.findByEmail("life@example.com"))!;
    assert.deepEqual(account.plan, { tier: "pro", interval: "lifetime", status: "active" });
    await applyEvent({ type: "subscription.revoked", data: subscription({ customer: { id: "cust-1", email: "life@example.com" } }) }, deps);
    assert.equal((await store.getAccount(account.id))!.plan.interval, "lifetime");
    const summary = summarize((await store.getAccount(account.id))!, undefined, NOW.getTime());
    assert.equal(summary.pro, true);
    assert.equal(summary.proUntil, null);
  });

  it("rewards a referrer without a subscription with bonus days, once", async () => {
    const { store, deps } = setup();
    const { referrer } = await referred(store);
    const first = await applyEvent({ type: "order.paid", data: order({ id: "o1" }) }, deps);
    assert.ok(first.handled && first.rewarded?.via === "bonus");
    let r = (await store.getAccount(referrer.id))!;
    assert.equal(r.bonusProUntil, new Date(NOW.getTime() + 30 * DAY).toISOString());
    assert.ok(r.referrals[0].paidAt);

    const retry = await applyEvent({ type: "order.paid", data: order({ id: "o1" }) }, deps);
    assert.ok(retry.handled && retry.duplicate);
    const renewal = await applyEvent({ type: "order.paid", data: order({ id: "o2" }) }, deps);
    assert.ok(renewal.handled && !renewal.rewarded);
    r = (await store.getAccount(referrer.id))!;
    assert.equal(r.bonusProUntil, new Date(NOW.getTime() + 30 * DAY).toISOString());

    const summary = summarize(r, "https://nootle.ai", NOW.getTime());
    assert.equal(summary.pro, true);
    assert.equal(summary.proUntil, r.bonusProUntil);
    assert.deepEqual(summary.referral, {
      code: r.referralCode,
      url: `https://nootle.ai/r/${r.referralCode}`,
      joined: 1,
      paid: 1,
      monthsEarned: 1,
    });
  });

  it("stacks bonus days after an existing bonus", async () => {
    const { store, deps } = setup();
    const { referrer } = await referred(store);
    const later = new Date(NOW.getTime() + 10 * DAY).toISOString();
    await store.saveAccount({ ...referrer, bonusProUntil: later });
    await applyEvent({ type: "order.paid", data: order({ id: "o1" }) }, deps);
    assert.equal((await store.getAccount(referrer.id))!.bonusProUntil, new Date(NOW.getTime() + 40 * DAY).toISOString());
  });

  it("moves a subscribed referrer's renewal instead", async () => {
    const calls: [string, number][] = [];
    const { store, deps } = setup(async (id, days) => {
      calls.push([id, days]);
      return { renewsAt: "2027-02-01T00:00:00.000Z" };
    });
    const { referrer } = await referred(store);
    await store.saveAccount({
      ...referrer,
      plan: { tier: "pro", interval: "monthly", status: "active", subscriptionId: "sub-r", renewsAt: "2027-01-01T00:00:00.000Z" },
    });
    const result = await applyEvent({ type: "order.paid", data: order({ id: "o1" }) }, deps);
    assert.ok(result.handled && result.rewarded?.via === "subscription");
    assert.deepEqual(calls, [["sub-r", 30]]);
    const r = (await store.getAccount(referrer.id))!;
    assert.equal(r.plan.renewsAt, "2027-02-01T00:00:00.000Z");
    assert.equal(r.bonusProUntil, undefined);
  });

  it("falls back to bonus days when Polar refuses the extension", async () => {
    const { store, deps } = setup(async () => {
      throw new Error("422");
    });
    const { referrer } = await referred(store);
    await store.saveAccount({
      ...referrer,
      plan: { tier: "pro", interval: "monthly", status: "active", subscriptionId: "sub-r", renewsAt: "2026-12-20T00:00:00.000Z" },
    });
    const result = await applyEvent({ type: "order.paid", data: order({ id: "o1" }) }, deps);
    assert.ok(result.handled && result.rewarded?.via === "bonus");
    assert.equal((await store.getAccount(referrer.id))!.bonusProUntil, new Date(Date.parse("2026-12-20T00:00:00.000Z") + 30 * DAY).toISOString());
  });

  it("credits a guest checkout's ref from metadata, but never a self-referral or a free order", async () => {
    const { store, deps } = setup();
    const referrer = await store.createAccount({ email: "ref@example.com" });
    await applyEvent({ type: "order.paid", data: order({ id: "g1", email: "guest@example.com", metadata: { ref: referrer.referralCode } }) }, deps);
    const guest = (await store.findByEmail("guest@example.com"))!;
    assert.equal(guest.referredBy, referrer.referralCode);
    assert.equal((await store.getAccount(referrer.id))!.referrals[0].accountId, guest.id);
    assert.ok((await store.getAccount(referrer.id))!.bonusProUntil);

    const self = await applyEvent(
      { type: "order.paid", data: order({ id: "s1", email: "ref@example.com", metadata: { ref: referrer.referralCode } }) },
      deps,
    );
    assert.ok(self.handled && !self.rewarded);

    const { deps: deps2, store: store2 } = setup();
    await referred(store2);
    const free = await applyEvent({ type: "order.paid", data: order({ id: "f1", total_amount: 0 }) }, deps2);
    assert.ok(free.handled && !free.rewarded);
  });
});

describe("products", () => {
  it("maps configured product ids to intervals", () => {
    assert.deepEqual(productsFromEnv({ POLAR_PRODUCT_MONTHLY: "m", POLAR_PRODUCT_LIFETIME: "l" }), { m: "monthly", l: "lifetime" });
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ type: "order.paid", data: {} });
  const sign = (key: Buffer, id: string, ts: number) =>
    `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const headers = (signature: string, ts: number) =>
    new Headers({ "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": signature });
  const now = Date.parse("2026-12-01T12:00:00Z");
  const ts = Math.floor(now / 1000);

  it("accepts a Standard Webhooks secret (base64 after whsec_)", () => {
    const key = Buffer.from("standard-webhooks-key-bytes-here");
    const secret = `whsec_${key.toString("base64")}`;
    assert.equal(verifyWebhook(body, headers(sign(key, "msg_1", ts), ts), secret, now), true);
  });

  it("accepts a legacy Polar secret (its UTF-8 bytes), among several signatures", () => {
    const secret = "polar_whs_legacySecret123";
    const signature = `v1,AAAA ${sign(Buffer.from(secret, "utf8"), "msg_1", ts)}`;
    assert.equal(verifyWebhook(body, headers(signature, ts), secret, now), true);
  });

  it("refuses a wrong secret, a changed body, or an old timestamp", () => {
    const secret = "polar_whs_legacySecret123";
    const key = Buffer.from(secret, "utf8");
    assert.equal(verifyWebhook(body, headers(sign(key, "msg_1", ts), ts), "other", now), false);
    assert.equal(verifyWebhook(body + " ", headers(sign(key, "msg_1", ts), ts), secret, now), false);
    const old = ts - 6 * 60;
    assert.equal(verifyWebhook(body, headers(sign(key, "msg_1", old), old), secret, now), false);
    assert.equal(verifyWebhook(body, new Headers(), secret, now), false);
  });
});

describe("share meta", () => {
  it("accepts a referral code and a boolean, nothing else", () => {
    assert.deepEqual(parseShareMeta({ iv: "x" }), {});
    assert.deepEqual(parseShareMeta({ ref: "ABCDEFGH", branding: false }), { ref: "ABCDEFGH", branding: false });
    assert.deepEqual(parseShareMeta({ ref: "abcdefgh" }), { ref: "ABCDEFGH" });
    assert.equal(parseShareMeta({ ref: "ABCDEFG1" }), null);
    assert.equal(parseShareMeta({ branding: "no" }), null);
  });
});

describe("sealer", () => {
  const key = Buffer.alloc(32, 7);
  const { seal, open } = sealer<"a" | "b">(() => key, 200);

  it("opens only as the kind it was sealed as, until it expires", () => {
    const token = seal("a", { x: 1 }, 60);
    assert.equal(open<{ x: number }>("a", token)?.x, 1);
    assert.equal(open("b", token), null);
    assert.equal(open("a", seal("a", { x: 1 }, -1)), null);
    assert.equal(open("a", seal("a", { pad: "x".repeat(200) })), null);
  });
});
