import { handleMcp, methodNotAllowed } from "@/lib/mcp";

/** The MCP server. Clients sign each person in with OAuth (lib/oauth.ts), then send their token. */
export const POST = (request: Request) => handleMcp(request);
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
