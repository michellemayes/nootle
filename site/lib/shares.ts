// Storage for share links and AI connectors. The Nootle app encrypts a note
// before uploading it, and the key lives only in the link's #fragment, which
// browsers never send to a server. So nootle.ai only ever stores ciphertext
// it can't read.
//
// A connector is the same kind of sealed blob: the list of shares the user
// lets their AI read, with each share's key. Its own key is in the connector
// link, which the AI client sends with every request (see lib/mcp.ts), so
// nootle.ai can open it only while answering one, and never stores the key.

import { createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/** Well under Vercel's 4.5 MB request body limit. */
const MAX_CIPHERTEXT_CHARS = 3_000_000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** 12-byte AES-GCM nonce, base64url without padding. */
const IV_CHARS = 16;
/** AES-GCM appends a 16-byte tag to the ciphertext. */
const TAG_BYTES = 16;

export interface Sealed {
  iv: string;
  ciphertext: string;
}

interface Stored extends Sealed {
  tokenHash: string;
  updatedAt: string;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Ids are 16 random bytes, base64url: 22 characters. */
export const isId = (id: string) => id.length === 22 && BASE64URL.test(id);

/** The encrypted note from a request body, or null when it isn't one. */
export function parseSealed(body: unknown): Sealed | null {
  const { iv, ciphertext } = (body ?? {}) as Record<string, unknown>;
  if (typeof iv !== "string" || iv.length !== IV_CHARS || !BASE64URL.test(iv)) return null;
  if (
    typeof ciphertext !== "string" ||
    ciphertext.length === 0 ||
    ciphertext.length > MAX_CIPHERTEXT_CHARS ||
    !BASE64URL.test(ciphertext)
  ) {
    return null;
  }
  return { iv, ciphertext };
}

/**
 * Decrypts what was sealed with `key` (base64url, or raw bytes) and `aad`, or
 * null if either doesn't fit.
 */
export function openSealed({ iv, ciphertext }: Sealed, key: string | Buffer, aad?: string): string | null {
  try {
    const data = Buffer.from(ciphertext, "base64url");
    const keyBytes = typeof key === "string" ? Buffer.from(key, "base64url") : key;
    const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(iv, "base64url"));
    if (aad) decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Sealed blobs under `prefix/` in Vercel Blob, each changed only with its token. */
function sealedStore(prefix: string) {
  const pathFor = (id: string) => `${prefix}/${id}.json`;

  async function write(id: string, sealed: Sealed, tokenHash: string) {
    const stored: Stored = { ...sealed, tokenHash, updatedAt: new Date().toISOString() };
    await put(pathFor(id), JSON.stringify(stored), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  }

  return {
    async read(id: string): Promise<Stored | null> {
      if (!isId(id)) return null;
      const result = await get(pathFor(id), { access: "private", useCache: false });
      if (!result) return null;
      return JSON.parse(await new Response(result.stream).text()) as Stored;
    },
    /** Stores a new blob and returns its id and the token that can change it. */
    async create(sealed: Sealed): Promise<{ id: string; token: string }> {
      const id = randomBytes(16).toString("base64url");
      const token = randomBytes(32).toString("base64url");
      await write(id, sealed, hashToken(token));
      return { id, token };
    },
    write,
    delete: (id: string) => del(pathFor(id)),
  };
}

export type SealedStore = ReturnType<typeof sealedStore>;

export const shares = sealedStore("shares");
export const connectors = sealedStore("connectors");

/** The token from a request's `Authorization: Bearer <token>`. */
export const bearer = (request: Request) => request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];

/** Whether the request's bearer token may change `stored`. */
export function mayChange(stored: Stored, request: Request): boolean {
  const token = bearer(request);
  if (!token) return false;
  const given = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(stored.tokenHash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
