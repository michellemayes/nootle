import { bearer, handleMcp, methodNotAllowed } from "@/lib/mcp";

/** The MCP server at the connector link, `/mcp/<id>.<key>`, for clients that only take a URL. */
export async function POST(request: Request, { params }: { params: Promise<{ credential: string }> }) {
  return handleMcp(request, bearer(request) ?? (await params).credential);
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
