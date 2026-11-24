// Who's signed in: a browser by its nootle_session cookie, the Nootle app by
// its device token (`Authorization: Bearer <token>`). Both carry the
// account's deviceVersion, so bumping it signs every one of them out.

import { cookies, headers } from "next/headers";
import { open, seal } from "@/lib/account/seal";
import { getAccount } from "@/lib/account/store";
import { REFERRAL_CODE, REFERRAL_COOKIE, SESSION_COOKIE, type Account } from "@/lib/account/types";

const SESSION_SECONDS = 180 * 24 * 60 * 60;

interface Grant {
  accountId: string;
  v: number;
}

async function accountFor(grant: Grant | null): Promise<Account | null> {
  if (!grant) return null;
  const account = await getAccount(grant.accountId);
  return account && account.deviceVersion === grant.v ? account : null;
}

/**
 * The signed-in account, for server components, server functions and route
 * handlers. A device token wins over the cookie; pass `{ device: false }` to
 * accept only a browser session.
 */
export async function getCurrentAccount({ device = true }: { device?: boolean } = {}): Promise<Account | null> {
  if (device) {
    const token = (await headers()).get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (token) return accountFor(open<Grant>("device", token));
  }
  return accountFor(open<Grant>("session", (await cookies()).get(SESSION_COOKIE)?.value));
}

/** A token the Nootle app keeps to call GET /api/account; it never expires, but signing out every Mac revokes it. */
export const mintDeviceToken = (account: Account) =>
  seal("device", { accountId: account.id, v: account.deviceVersion } satisfies Grant);

/** Signs this browser in as `account` (in a route handler or server function). */
export async function setSessionCookie(account: Account): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, seal("session", { accountId: account.id, v: account.deviceVersion }, SESSION_SECONDS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Whether a POST came from an HTML form (redirect it) rather than fetch (answer with a status). */
export const isFormPost = (request: Request) =>
  /^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(request.headers.get("content-type") ?? "");

/** The referral code from the nootle_ref cookie, if it's a well-formed one. */
export async function getReferralCookie(): Promise<string | undefined> {
  const code = (await cookies()).get(REFERRAL_COOKIE)?.value;
  return code && REFERRAL_CODE.test(code) ? code : undefined;
}
