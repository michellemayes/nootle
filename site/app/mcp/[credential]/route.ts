import { handleMcp, methodNotAllowed } from "@/lib/mcp";

/** The MCP server at an old-style connector link, `/mcp/<id>.<key>`, which carries the key itself. */
export async function POST(request: Request, { params }: { params: Promise<{ credential: string }> }) {
  return handleMcp(request, (await params).credential);
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
