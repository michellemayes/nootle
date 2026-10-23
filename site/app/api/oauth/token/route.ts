import { exchange } from "@/lib/oauth";

/** Trades a sign-in code, or a refresh token, for an access token to /mcp. */
export async function POST(request: Request) {
  const result = exchange(new URLSearchParams(await request.text()));
  return Response.json(result, { status: "error" in result ? 400 : 200, headers: { "Cache-Control": "no-store" } });
}
