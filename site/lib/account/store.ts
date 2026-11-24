import { createHash, randomBytes, randomInt } from "node:crypto";
import { REFERRAL_ALPHABET, REFERRAL_CODE, type Account } from "@/lib/account/types";
import { blobKV, memoryKV, type KV } from "@/lib/kv";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailHash = (email: string) => createHash("sha256").update(normalizeEmail(email)).digest("hex");
const emailKey = (email: string) => `account-emails/${emailHash(email)}.json`;
const magicKey = (email: string) => `magic-links/${emailHash(email)}.json`;
const accountKey = (id: string) => `accounts/${id}.json`;
const codeKey = (code: string) => `referral-codes/${code}.json`;
const polarKey = (customerId: string) => `polar-customers/${customerId}.json`;

const ACCOUNT_ID = /^[A-Za-z0-9_-]{16}$/;
const POLAR_ID = /^[A-Za-z0-9-]{1,64}$/;

const referralCode = () => Array.from({ length: 8 }, () => REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)]).join("");

export function accountStore(kv: KV) {
  async function byIndex(key: string): Promise<Account | null> {
    const entry = await kv.get<{ id: string }>(key);
    return entry ? getAccount(entry.id) : null;
  }

  async function getAccount(id: string): Promise<Account | null> {
    if (typeof id !== "string" || !ACCOUNT_ID.test(id)) return null;
    return kv.get<Account>(accountKey(id));
  }

  const isCode = (code: string) => typeof code === "string" && REFERRAL_CODE.test(code);
  const findByEmail = (email: string) => byIndex(emailKey(email));
  const findByReferralCode = (code: string) => (isCode(code) ? byIndex(codeKey(code)) : Promise.resolve(null));
  const findByPolarCustomer = (customerId: string) =>
    typeof customerId === "string" && POLAR_ID.test(customerId) ? byIndex(polarKey(customerId)) : Promise.resolve(null);

  async function saveAccount(account: Account): Promise<void> {
    await Promise.all([
      kv.put(accountKey(account.id), account),
      account.polarCustomerId && POLAR_ID.test(account.polarCustomerId)
        ? kv.put(polarKey(account.polarCustomerId), { id: account.id })
        : null,
    ]);
  }

  async function reserveCode(id: string): Promise<string> {
    let code = referralCode();
    while (!(await kv.putIfAbsent(codeKey(code), { id }))) code = referralCode();
    return code;
  }

  /** A new account for `email`, or the existing one. An unknown `referredBy` is dropped. */
  async function createAccount({ email, referredBy }: { email: string; referredBy?: string }): Promise<Account> {
    const existing = await findByEmail(email);
    if (existing) return existing;

    const id = randomBytes(12).toString("base64url");
    const [code, referrer] = await Promise.all([
      reserveCode(id),
      referredBy ? findByReferralCode(referredBy) : null,
    ]);
    const now = new Date().toISOString();
    const account: Account = {
      id,
      email: normalizeEmail(email),
      createdAt: now,
      referralCode: code,
      referredBy: referrer ? referrer.referralCode : undefined,
      plan: { tier: "free" },
      referrals: [],
      processedOrders: [],
      deviceVersion: 1,
    };
    await kv.put(accountKey(id), account);
    if (!(await kv.putIfAbsent(emailKey(email), { id }))) {
      // Signed up twice at once: the other request's account wins.
      const winner = await findByEmail(email);
      if (winner) return winner;
      await kv.put(emailKey(email), { id });
    }
    if (referrer) {
      referrer.referrals.push({ accountId: id, joinedAt: now });
      await saveAccount(referrer);
    }
    return account;
  }

  return {
    getAccount,
    findByEmail,
    findByReferralCode,
    findByPolarCustomer,
    createAccount,
    saveAccount,
    async referralCodeExists(code: string): Promise<boolean> {
      return isCode(code) && (await kv.get(codeKey(code))) !== null;
    },
    async magicLinkSentAt(email: string): Promise<number | null> {
      return (await kv.get<{ sentAt: number }>(magicKey(email)))?.sentAt ?? null;
    },
    async markMagicLinkSent(email: string, sentAt = Date.now()): Promise<void> {
      await kv.put(magicKey(email), { sentAt });
    },
  };
}

export type AccountStore = ReturnType<typeof accountStore>;

/** Blob in a deploy, memory otherwise (on globalThis so `next dev`'s bundles share it). */
export function defaultStore(): AccountStore {
  const holder = globalThis as { nootleAccountStore?: AccountStore };
  return (holder.nootleAccountStore ??= accountStore(process.env.BLOB_READ_WRITE_TOKEN ? blobKV : memoryKV()));
}

export const getAccount = (id: string) => defaultStore().getAccount(id);
export const referralCodeExists = (code: string) => defaultStore().referralCodeExists(code);
export const createAccount = (input: { email: string; referredBy?: string }) => defaultStore().createAccount(input);
export const saveAccount = (account: Account) => defaultStore().saveAccount(account);
