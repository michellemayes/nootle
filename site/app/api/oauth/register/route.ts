import { registerClient } from "@/lib/oauth";

/** Dynamic client registration: AI clients register themselves before sending people to sign in. */
export async function POST(request: Request) {
  const client = registerClient(await request.json().catch(() => null));
  return Response.json(client, { status: "error" in client ? 400 : 201 });
}
