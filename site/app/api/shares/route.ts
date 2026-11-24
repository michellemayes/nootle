import { createRoute } from "@/lib/sealed-routes";
import { shares } from "@/lib/shares";

/** Stores an encrypted note from the Nootle app, with the sharer's referral code and branding choice if sent. */
export const POST = createRoute(shares, { meta: true });
