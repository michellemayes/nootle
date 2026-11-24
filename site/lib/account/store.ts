// nootle.ai accounts, kept in Vercel Blob as JSON documents (see
// docs/plans/2026-11-24-paid-plans.md): each account, plus small index
// documents that point an email, referral code or Polar customer at it.
// Without BLOB_READ_WRITE_TOKEN (local dev, tests) they live in memory.

import { createHash, randomBytes, randomInt } from "node:crypto";
import { get, put } from "@vercel/blob";
import { REFERRAL_ALPHABET, REFERRAL_CODE, type Account } from "@/lib/account/types";

/** A JSON key-value store. */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  /** Writes only if `key` is new; false when it already exists. */
  putIfAbsent(key: string, value: unknown): Promise<boolean>;
}

const blobPut = (key: string, value: unknown, allowOverwrite: boolean) =>
  put(key, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite,
    contentType: "application/json",
  });

export const blobKV: KV = {
  async get<T>(key: string) {
    const result = await get(key, { access: "private", useCache: false });
    if (!result) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  },
  async put(key, value) {
    await blobPut(key, value, true);
  },
  async putIfAbsent(key, value) {
    try {
      await blobPut(key, value, false);
      return true;
    } catch (error) {
      if (await blobKV.get(key)) return false;
      throw error;
    }
  },
};

export function memoryKV(map = new Map<string, string>()): KV {
  return {
    async get<T>(key: string) {
      const value = map.get(key);
      return value === undefined ? null : (JSON.parse(value) as T);
    },
    async put(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async putIfAbsent(key, value) {
      if (map.has(key)) return false;
      map.set(key, JSON.stringify(value));
      return true;
    },
  };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailKey = (email: string) =>
  `account-emails/${createHash("sha256").update(normalizeEmail(email)).digest("hex")}.json`;
const accountKey = (id: string) => `accounts/${id}.json`;
const codeKey = (code: string) => `referral-codes/${code}.json`;
const polarKey = (customerId: string) => `polar-customers/${customerId}.json`;
const magicKey = (email: string) => emailKey(email).replace("account-emails/", "magic-links/");

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

  const findByEmail = (email: string) => byIndex(emailKey(email));
  const findByReferralCode = (code: string) =>
    typeof code === "string" && REFERRAL_CODE.test(code) ? byIndex(codeKey(code)) : Promise.resolve(null);
  const findByPolarCustomer = (customerId: string) =>
    typeof customerId === "string" && POLAR_ID.test(customerId) ? byIndex(polarKey(customerId)) : Promise.resolve(null);

  /** Writes the account, and points its Polar customer at it. */
  async function saveAccount(account: Account): Promise<void> {
    await kv.put(accountKey(account.id), account);
    if (account.polarCustomerId && POLAR_ID.test(account.polarCustomerId)) {
      await kv.put(polarKey(account.polarCustomerId), { id: account.id });
    }
  }

  /**
   * A new account for `email`, or the existing one if someone got there
   * first. A valid `referredBy` is kept and the referrer told; an unknown
   * code is dropped.
   */
  async function createAccount({ email, referredBy }: { email: string; referredBy?: string }): Promise<Account> {
    const existing = await findByEmail(email);
    if (existing) return existing;

    const id = randomBytes(12).toString("base64url");
    let code = referralCode();
    while (!(await kv.putIfAbsent(codeKey(code), { id }))) code = referralCode();

    const referrer = referredBy ? await findByReferralCode(referredBy) : null;
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
    /** When a sign-in link was last sent to `email`, in ms since the epoch. */
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
export const findByEmail = (email: string) => defaultStore().findByEmail(email);
export const findByReferralCode = (code: string) => defaultStore().findByReferralCode(code);
export const findByPolarCustomer = (customerId: string) => defaultStore().findByPolarCustomer(customerId);
export const createAccount = (input: { email: string; referredBy?: string }) => defaultStore().createAccount(input);
export const saveAccount = (account: Account) => defaultStore().saveAccount(account);
