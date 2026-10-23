import { authorizationServerMetadata } from "@/lib/oauth";

/** Where AI clients register, send people to sign in, and get tokens (RFC 8414). */
export const GET = (request: Request) => Response.json(authorizationServerMetadata(new URL(request.url).origin));
