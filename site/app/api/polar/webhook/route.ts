import * as Sentry from "@sentry/nextjs";
import { defaultStore } from "@/lib/account/store";
import { extendSubscription, polarConfigured, verifyWebhook } from "@/lib/billing/polar";
import { applyEvent, productsFromEnv, type PolarEvent } from "@/lib/billing/webhook";

/** Polar's billing events: verified, then applied to accounts. A 5xx makes Polar retry. */
export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyWebhook(body, request.headers, process.env.POLAR_WEBHOOK_SECRET ?? "")) {
    return Response.json({ error: "Bad signature" }, { status: 403 });
  }
  let event: PolarEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Bad body" }, { status: 400 });
  }
  if (typeof event?.type !== "string" || typeof event.data !== "object" || event.data === null) {
    return Response.json({ error: "Bad body" }, { status: 400 });
  }

  try {
    await applyEvent(event, {
      store: defaultStore(),
      products: productsFromEnv(),
      extendSubscription: polarConfigured() ? extendSubscription : undefined,
    });
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: "Couldn't apply the event" }, { status: 500 });
  }
  return new Response(null, { status: 202 });
}
