import { createHmac, timingSafeEqual } from "node:crypto";
import type { Account } from "@/lib/account/types";

// Pinned so payloads don't shift under us.
const API_VERSION = "2026-10";
const SERVERS = { sandbox: "https://sandbox-api.polar.sh", production: "https://api.polar.sh" } as const;
/** So a captured webhook can't be replayed. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export const polarConfigured = () => Boolean(process.env.POLAR_ACCESS_TOKEN);

const baseUrl = () => (process.env.POLAR_SERVER === "production" ? SERVERS.production : SERVERS.sandbox);

async function polar<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(baseUrl() + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      "Polar-Version": API_VERSION,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Polar ${method} ${path.replace(/[0-9a-f-]{36}/g, "{id}")} answered ${response.status}`);
  return (await response.json()) as T;
}

export type CustomerRef = { customerId: string } | { externalCustomerId: string };

export const customerRefFor = (account: Account): CustomerRef =>
  account.polarCustomerId ? { customerId: account.polarCustomerId } : { externalCustomerId: account.id };

const customerFields = (customer?: CustomerRef) =>
  !customer ? {} : "customerId" in customer ? { customer_id: customer.customerId } : { external_customer_id: customer.externalCustomerId };

export interface CheckoutInput {
  productId: string;
  customer?: CustomerRef;
  email?: string;
  discountId?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  returnUrl?: string;
}

export async function createCheckout(input: CheckoutInput): Promise<{ url: string }> {
  const checkout = await polar<{ url: string }>("POST", "/v1/checkouts/", {
    products: [input.productId],
    ...customerFields(input.customer),
    customer_email: input.customer ? undefined : input.email,
    discount_id: input.discountId,
    metadata: input.metadata,
    success_url: input.successUrl,
    return_url: input.returnUrl,
  });
  return { url: checkout.url };
}

export async function createCustomerSession(customer: CustomerRef, returnUrl?: string): Promise<{ url: string }> {
  const session = await polar<{ customer_portal_url: string }>("POST", "/v1/customer-sessions/", {
    ...customerFields(customer),
    return_url: returnUrl,
  });
  return { url: session.customer_portal_url };
}

export async function extendSubscription(id: string, days: number): Promise<{ renewsAt: string }> {
  const path = `/v1/subscriptions/${encodeURIComponent(id)}`;
  const subscription = await polar<{ current_period_end: string | null }>("GET", path);
  if (!subscription.current_period_end) throw new Error("Polar subscription has no billing period");
  const end = new Date(Date.parse(subscription.current_period_end) + days * 86_400_000).toISOString();
  const updated = await polar<{ current_period_end: string | null }>("PATCH", path, { current_billing_period_end: end });
  return { renewsAt: updated.current_period_end ?? end };
}

/**
 * The keys a Polar webhook secret may sign with. Endpoints made since
 * September 2026 use Standard Webhooks, whose key is the base64 after
 * `whsec_`; older ones use the UTF-8 bytes of the whole secret. Polar's SDK
 * tries both, and so does this.
 */
function webhookKeys(secret: string): Buffer[] {
  const keys = [Buffer.from(secret, "utf8")];
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) keys.push(Buffer.from(encoded, "base64"));
  return keys;
}

/**
 * Standard Webhooks: an HMAC-SHA256 of `<id>.<timestamp>.<body>` in
 * `webhook-signature` as `v1,<base64>`, possibly several separated by spaces.
 */
export function verifyWebhook(body: string, headers: Headers, secret: string, now = Date.now()): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!secret || !id || !timestamp || !signatures || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const given = signatures
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .map((s) => Buffer.from(s.slice(3), "base64"));
  const signed = `${id}.${timestamp}.${body}`;
  return webhookKeys(secret).some((key) => {
    const expected = createHmac("sha256", key).update(signed).digest();
    return given.some((g) => g.length === expected.length && timingSafeEqual(g, expected));
  });
}
