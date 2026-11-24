import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount, mintDeviceToken } from "@/lib/account/session";
import { AuthShell, ExpiredAppLink } from "../AuthShell";
import { appState } from "../params";
import { AppHandoff } from "./AppHandoff";

export const metadata: Metadata = {
  title: "Connect Nootle",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SignInAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = appState((await searchParams).state);
  if (!state) {
    return <ExpiredAppLink />;
  }

  const account = await getCurrentAccount();
  if (!account) redirect(`/signin?app=1&state=${state}`);

  const token = mintDeviceToken(account);
  const url = `nootle://account/connected?token=${encodeURIComponent(token)}&state=${state}`;
  return (
    <AuthShell>
      <AppHandoff url={url} email={account.email} />
    </AuthShell>
  );
}
