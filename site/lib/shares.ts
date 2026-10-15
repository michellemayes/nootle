// Storage for share links. The Nootle app encrypts a note before uploading
// it, and the key lives only in the link's #fragment, which browsers never
// send to a server. So nootle.ai only ever stores ciphertext it can't read.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/** Well under Vercel's 4.5 MB request body limit. */
const MAX_CIPHERTEXT_CHARS = 3_000_000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** 12-byte AES-GCM nonce, base64url without padding. */
const IV_CHARS = 16;

export interface Sealed {
  iv: string;
  ciphertext: string;
}

interface StoredShare extends Sealed {
  tokenHash: string;
  updatedAt: string;
}

const pathFor = (id: string) => `shares/${id}.json`;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Ids are 16 random bytes, base64url: 22 characters. */
export const isShareId = (id: string) => id.length === 22 && BASE64URL.test(id);

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

export async function readShare(id: string): Promise<StoredShare | null> {
  const result = await get(pathFor(id), { access: "private", useCache: false });
  if (!result) return null;
  return JSON.parse(await new Response(result.stream).text()) as StoredShare;
}

/** Stores a new share and returns its id and the token that can change it. */
export async function createShare(sealed: Sealed): Promise<{ id: string; token: string }> {
  const id = randomBytes(16).toString("base64url");
  const token = randomBytes(32).toString("base64url");
  await writeShare(id, sealed, hashToken(token));
  return { id, token };
}

export async function writeShare(id: string, sealed: Sealed, tokenHash: string) {
  const stored: StoredShare = { ...sealed, tokenHash, updatedAt: new Date().toISOString() };
  await put(pathFor(id), JSON.stringify(stored), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export const deleteShare = (id: string) => del(pathFor(id));

/** Whether the request's `Authorization: Bearer <token>` may change `share`. */
export function mayChange(share: StoredShare, authorization: string | null): boolean {
  const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return false;
  const given = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(share.tokenHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}
