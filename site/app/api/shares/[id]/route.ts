import { deleteShare, isShareId, mayChange, parseSealed, readShare, writeShare } from "@/lib/shares";

type Context = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** The encrypted note, for the share page to decrypt in the browser. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const share = isShareId(id) ? await readShare(id) : null;
  if (!share) return notFound();
  return Response.json(
    { iv: share.iv, ciphertext: share.ciphertext },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Replaces the note, keeping its link. Needs the share's token. */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const share = isShareId(id) ? await readShare(id) : null;
  if (!share) return notFound();
  if (!mayChange(share, request.headers.get("authorization"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const sealed = parseSealed(await request.json().catch(() => null));
  if (!sealed) return Response.json({ error: "Expected { iv, ciphertext }" }, { status: 400 });
  await writeShare(id, sealed, share.tokenHash);
  return new Response(null, { status: 204 });
}

/** Deletes the note, so its link stops working. Needs the share's token. */
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const share = isShareId(id) ? await readShare(id) : null;
  if (!share) return notFound();
  if (!mayChange(share, request.headers.get("authorization"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteShare(id);
  return new Response(null, { status: 204 });
}
