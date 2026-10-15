import { createShare, parseSealed } from "@/lib/shares";

/** Stores an encrypted note from the Nootle app. */
export async function POST(request: Request) {
  const sealed = parseSealed(await request.json().catch(() => null));
  if (!sealed) return Response.json({ error: "Expected { iv, ciphertext }" }, { status: 400 });
  return Response.json(await createShare(sealed), { status: 201 });
}
