import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { primaryButton } from "@/components/ui";
import { getCurrentAccount } from "@/lib/account/session";
import { AuthShell, ExpiredAppLink, authHeading } from "./AuthShell";
import { SignInForm } from "./SignInForm";
import { appState as parseAppState, safeNext } from "./params";

export const metadata: Metadata = {
  title: "Sign in - Nootle",
  robots: { index: false, follow: true },
  alternates: { canonical: "/signin" },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const appMode = params.app === "1";
  const state = parseAppState(params.state);
  const next = safeNext(params.next);
  const account = await getCurrentAccount();

  if (account && !appMode) redirect(next ?? "/account");

  if (appMode && !state) {
    return <ExpiredAppLink />;
  }

  if (account && state) {
    return (
      <AuthShell>
        <h1 className={authHeading}>Connect Nootle</h1>
        <Link href={`/signin/app?state=${state}`} className={`${primaryButton} group mt-7 w-full py-3.5 text-base`}>
          <span className="truncate">Connect Nootle as {account.email}</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <SignOutButton className="mt-4 w-full text-center text-sm text-[var(--color-text-secondary)] underline hover:text-[var(--color-text)] inline-flex items-center justify-center gap-2">
          Use a different email
        </SignOutButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className={authHeading}>{state ? "Connect Nootle" : "Sign in to Nootle"}</h1>
      <p className="mt-3 mb-7 text-[var(--color-text-secondary)]">We&apos;ll email you a link. No password.</p>
      <SignInForm next={next} appState={state} />
    </AuthShell>
  );
}
