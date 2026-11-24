import { createRoute } from "@/lib/sealed-routes";
import { shares } from "@/lib/shares";

/** Stores an encrypted note from the Nootle app. */
export const POST = createRoute(shares);
