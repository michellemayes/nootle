// The API routes the Nootle app uses to upload, replace and delete a sealed
// blob (a shared note or a connector), shared by /api/shares and /api/connectors.

import { mayChange, parseSealed, parseShareMeta, type SealedStore, type ShareMeta } from "@/lib/shares";

type Context = { params: Promise<{ id: string }> };

/** Shares also take `ref` and `branding`; connectors don't. */
interface Options {
  meta?: boolean;
}

const BAD_BODY = { error: "Expected { iv, ciphertext }" };
const BAD_META = { error: "Expected ref to be a referral code and branding a boolean" };
const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** The sealed blob and, for shares, its extras from a request body; a Response when malformed. */
async function readBody(request: Request, options: Options) {
  const body = await request.json().catch(() => null);
  const sealed = parseSealed(body);
  if (!sealed) return Response.json(BAD_BODY, { status: 400 });
  const meta: ShareMeta | null = options.meta ? parseShareMeta(body) : {};
  if (!meta) return Response.json(BAD_META, { status: 400 });
  return { sealed, meta };
}

/** POST: stores a new blob and returns `{ id, token }`. */
export const createRoute = (store: SealedStore, options: Options = {}) =>
  async function POST(request: Request) {
    const body = await readBody(request, options);
    if (body instanceof Response) return body;
    return Response.json(await store.create(body.sealed, body.meta), { status: 201 });
  };

/**
 * PUT replaces the blob, keeping its id (and a share's ref and branding
 * unless new ones are sent); DELETE removes it. Both need its token.
 */
export function changeRoutes(store: SealedStore, options: Options = {}) {
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
      const body = await readBody(request, options);
      if (body instanceof Response) return body;
      const { ref, branding } = found.stored;
      await store.write(found.id, body.sealed, found.stored.tokenHash, { ref, branding, ...body.meta });
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
