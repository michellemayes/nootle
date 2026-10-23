import { protectedResourceMetadata } from "@/lib/oauth";

/** Tells AI clients that /mcp needs a token, and where to get one (RFC 9728). */
export const GET = (request: Request) => Response.json(protectedResourceMetadata(new URL(request.url).origin));
