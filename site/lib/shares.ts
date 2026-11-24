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
import { del } from "@vercel/blob";
import { normalizeReferralCode } from "@/lib/account/types";
import { blobKV } from "@/lib/kv";

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

export interface ShareMeta {
  ref?: string;
  branding?: boolean;
}

type Unsaved<Extras> = Sealed & Extras & { tokenHash: string };
type Stored<Extras> = Unsaved<Extras> & { updatedAt: string };

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

export function parseShareMeta(body: unknown): ShareMeta | null {
  const { ref, branding } = (body ?? {}) as Record<string, unknown>;
  const code = ref === undefined ? undefined : typeof ref === "string" ? normalizeReferralCode(ref) : null;
  if (code === null) return null;
  if (branding !== undefined && typeof branding !== "boolean") return null;
  return { ...(code && { ref: code }), ...(branding !== undefined && { branding }) };
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
function sealedStore<Extras extends object = Record<never, never>>(
  prefix: string,
  parseExtras?: (body: unknown) => Extras | null,
) {
  const pathFor = (id: string) => `${prefix}/${id}.json`;
  const save = (id: string, record: Unsaved<Extras>) =>
    blobKV.put(pathFor(id), { ...record, updatedAt: new Date().toISOString() });

  return {
    parseExtras: (body: unknown): Extras | null => (parseExtras ? parseExtras(body) : ({} as Extras)),
    async read(id: string): Promise<Stored<Extras> | null> {
      return isId(id) ? blobKV.get<Stored<Extras>>(pathFor(id)) : null;
    },
    /** Stores a new blob and returns its id and the token that can change it. */
    async create(sealed: Sealed, extras = {} as Extras): Promise<{ id: string; token: string }> {
      const id = randomBytes(16).toString("base64url");
      const token = randomBytes(32).toString("base64url");
      await save(id, { ...extras, ...sealed, tokenHash: hashToken(token) });
      return { id, token };
    },
    /** Replaces the blob, keeping its token and any extras `extras` doesn't set. */
    write: (id: string, stored: Stored<Extras>, sealed: Sealed, extras = {} as Extras) =>
      save(id, { ...stored, ...extras, ...sealed }),
    delete: (id: string) => del(pathFor(id)),
  };
}

export type SealedStore<Extras extends object> = ReturnType<typeof sealedStore<Extras>>;

export const shares = sealedStore("shares", parseShareMeta);
export const connectors = sealedStore("connectors");

export function publicShare(stored: Stored<ShareMeta>): Sealed & ShareMeta {
  const view: Partial<Stored<ShareMeta>> = { ...stored };
  delete view.tokenHash;
  delete view.updatedAt;
  return view as Sealed & ShareMeta;
}

/** The token from `Authorization: Bearer <token>`. */
export const bearer = (headers: Headers) => headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];

/** Whether the request's bearer token may change `stored`. */
export function mayChange(stored: { tokenHash: string }, request: Request): boolean {
  const token = bearer(request.headers);
  if (!token) return false;
  const given = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(stored.tokenHash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
