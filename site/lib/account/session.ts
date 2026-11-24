import { cookies, headers } from "next/headers";
import { cache } from "react";
import { open, seal } from "@/lib/account/seal";
import { getAccount } from "@/lib/account/store";
import { SESSION_COOKIE, type Account } from "@/lib/account/types";
import { bearer } from "@/lib/shares";

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

const currentAccount = cache(async (device: boolean): Promise<Account | null> => {
  if (device) {
    const token = bearer(await headers());
    if (token) return accountFor(open<Grant>("device", token));
  }
  return accountFor(open<Grant>("session", (await cookies()).get(SESSION_COOKIE)?.value));
});

/** The Nootle app's device token wins over the session cookie; `{ device: false }` accepts only a browser session. */
export const getCurrentAccount = ({ device = true }: { device?: boolean } = {}) => currentAccount(device);

/** Never expires, but signing out every Mac revokes it. */
export const mintDeviceToken = (account: Account) =>
  seal("device", { accountId: account.id, v: account.deviceVersion } satisfies Grant);

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
