import { createRoute } from "@/lib/sealed-routes";
import { connectors } from "@/lib/shares";

/** Stores a new AI connector: the encrypted list of shares it may read. */
export const POST = createRoute(connectors);
