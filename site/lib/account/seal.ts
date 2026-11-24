import { hkdfSync, randomBytes } from "node:crypto";
import { sealer } from "@/lib/seal";

export type SealKind = "magic" | "session" | "device";

let key: Buffer | undefined;

/**
 * `AUTH_SECRET`, or else one derived from the Blob token (with a different
 * label from lib/oauth.ts's) so a deploy works without extra setup. Changing
 * it signs everyone out, browsers and Macs.
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

export const { seal, open } = sealer<SealKind>(accountKey, 4096);
