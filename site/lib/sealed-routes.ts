// The API routes the Nootle app uses to upload, replace and delete a sealed
// blob (a shared note or a connector), shared by /api/shares and /api/connectors.

import { mayChange, parseSealed, type SealedStore } from "@/lib/shares";

type Context = { params: Promise<{ id: string }> };

const BAD_BODY = { error: "Expected { iv, ciphertext }" };
const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** POST: stores a new blob and returns `{ id, token }`. */
export const createRoute = (store: SealedStore) =>
  async function POST(request: Request) {
    const sealed = parseSealed(await request.json().catch(() => null));
    if (!sealed) return Response.json(BAD_BODY, { status: 400 });
    return Response.json(await store.create(sealed), { status: 201 });
  };

/** PUT replaces the blob, keeping its id; DELETE removes it. Both need its token. */
export function changeRoutes(store: SealedStore) {
  async function authorized(request: Request, { params }: Context) {
    const { id } = await params;
    const stored = await store.read(id);
    if (!stored) return notFound();
    if (!mayChange(stored, request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return { id, stored };
  }

  return {
    async PUT(request: Request, context: Context) {
      const found = await authorized(request, context);
      if (found instanceof Response) return found;
      const sealed = parseSealed(await request.json().catch(() => null));
      if (!sealed) return Response.json(BAD_BODY, { status: 400 });
      await store.write(found.id, sealed, found.stored.tokenHash);
      return new Response(null, { status: 204 });
    },
    async DELETE(request: Request, context: Context) {
      const found = await authorized(request, context);
      if (found instanceof Response) return found;
      await store.delete(found.id);
      return new Response(null, { status: 204 });
    },
  };
}
