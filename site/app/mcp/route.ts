import { bearer, handleMcp, methodNotAllowed } from "@/lib/mcp";

/** The MCP server, for clients that send the connector as `Authorization: Bearer <id>.<key>`. */
export const POST = (request: Request) => handleMcp(request, bearer(request));
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
