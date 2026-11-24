// Sealed (AES-256-GCM) tokens for nootle.ai accounts: magic sign-in links,
// browser sessions and the Nootle app's device tokens. Each kind can only be
// opened as itself, and the key differs from lib/oauth.ts's even when both
// come from the Blob token.

import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { openSealed } from "@/lib/shares";

export type SealKind = "magic" | "session" | "device";

/** Characters in a base64url 12-byte IV, which starts every sealed string. */
const IV_CHARS = 16;

let key: Buffer | undefined;

/**
 * `AUTH_SECRET`, or else one derived from the Blob token so a deploy works
 * without extra setup. Changing it signs everyone out, browsers and Macs.
 * Local dev without either gets a key that lasts until the server restarts.
 */
function accountKey(): Buffer {
  if (key) return key;
  const material = process.env.AUTH_SECRET ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (material) {
    key = Buffer.from(hkdfSync("sha256", material, "nootle", "account", 32));
  } else if (process.env.NODE_ENV !== "production") {
    // On globalThis so every route and page bundle in `next dev` shares it.
    const dev = globalThis as { nootleDevAccountKey?: Buffer };
    key = dev.nootleDevAccountKey ??= randomBytes(32);
  } else {
    throw new Error("Set AUTH_SECRET to sign people in");
  }
  return key;
}

/** Seals `payload` as a `kind`, expiring after `seconds` when given. */
export function seal(kind: SealKind, payload: object, seconds?: number): string {
  const body = seconds === undefined ? payload : { ...payload, exp: Math.floor(Date.now() / 1000) + seconds };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accountKey(), iv).setAAD(Buffer.from(kind));
  const data = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final(), cipher.getAuthTag()]);
  return iv.toString("base64url") + data.toString("base64url");
}

/** What `sealed` holds if it's an unexpired `kind`, else null. */
export function open<T>(kind: SealKind, sealed: unknown): T | null {
  if (typeof sealed !== "string" || sealed.length > 4096 || !/^[A-Za-z0-9_-]{40,}$/.test(sealed)) return null;
  const plain = openSealed({ iv: sealed.slice(0, IV_CHARS), ciphertext: sealed.slice(IV_CHARS) }, accountKey(), kind);
  if (plain === null) return null;
  const payload = JSON.parse(plain) as T & { exp?: number };
  return payload.exp !== undefined && payload.exp < Date.now() / 1000 ? null : payload;
}
