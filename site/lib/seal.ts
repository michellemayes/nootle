import { createCipheriv, randomBytes } from "node:crypto";
import { openSealed } from "@/lib/shares";

/** Characters in a base64url 12-byte IV, which starts every sealed string. */
const IV_CHARS = 16;
const SEALED = /^[A-Za-z0-9_-]{40,}$/;

/**
 * AES-256-GCM tokens under `key()`: the IV, then the ciphertext. Each kind is
 * the AAD, so a token only opens as the kind it was sealed as.
 */
export function sealer<Kind extends string>(key: () => Buffer, maxChars = Infinity) {
  return {
    seal(kind: Kind, payload: object, seconds?: number): string {
      const body = seconds === undefined ? payload : { ...payload, exp: Math.floor(Date.now() / 1000) + seconds };
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(), iv).setAAD(Buffer.from(kind));
      const data = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final(), cipher.getAuthTag()]);
      return iv.toString("base64url") + data.toString("base64url");
    },
    open<T>(kind: Kind, sealed: unknown): T | null {
      if (typeof sealed !== "string" || sealed.length > maxChars || !SEALED.test(sealed)) return null;
      const plain = openSealed({ iv: sealed.slice(0, IV_CHARS), ciphertext: sealed.slice(IV_CHARS) }, key(), kind);
      if (plain === null) return null;
      const payload = JSON.parse(plain) as T & { exp?: number };
      return payload.exp !== undefined && payload.exp < Date.now() / 1000 ? null : payload;
    },
  };
}
