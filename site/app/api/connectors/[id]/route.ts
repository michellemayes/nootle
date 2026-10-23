import { changeRoutes } from "@/lib/sealed-routes";
import { connectors } from "@/lib/shares";

/** PUT replaces the connector's list of shares; DELETE turns the connector off. */
export const { PUT, DELETE } = changeRoutes(connectors);
