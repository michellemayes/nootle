// The API routes the Nootle app uses to upload, replace and delete a sealed
// blob (a shared note or a connector), shared by /api/shares and /api/connectors.

import { mayChange, parseSealed, type SealedStore } from "@/lib/shares";

type Context = { params: Promise<{ id: string }> };

const BAD_BODY = { error: "Expected { iv, ciphertext }" };
const BAD_EXTRAS = { error: "Expected ref to be a referral code and branding a boolean" };
const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

async function readBody<Extras extends object>(request: Request, store: SealedStore<Extras>) {
  const body = await request.json().catch(() => null);
  const sealed = parseSealed(body);
  if (!sealed) return Response.json(BAD_BODY, { status: 400 });
  const extras = store.parseExtras(body);
  if (!extras) return Response.json(BAD_EXTRAS, { status: 400 });
  return { sealed, extras };
}

/** POST: stores a new blob and returns `{ id, token }`. */
export const createRoute = <Extras extends object>(store: SealedStore<Extras>) =>
  async function POST(request: Request) {
    const body = await readBody(request, store);
    if (body instanceof Response) return body;
    return Response.json(await store.create(body.sealed, body.extras), { status: 201 });
  };

/** PUT replaces the blob, keeping its id; DELETE removes it. Both need its token. */
export function changeRoutes<Extras extends object>(store: SealedStore<Extras>) {
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
      const body = await readBody(request, store);
      if (body instanceof Response) return body;
      await store.write(found.id, found.stored, body.sealed, body.extras);
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
