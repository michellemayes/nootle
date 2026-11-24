import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "../AuthShell";
import { CheckEmail } from "./CheckEmail";

export const metadata: Metadata = {
  title: "Check your email - Nootle",
  robots: { index: false, follow: false },
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email } = await searchParams;
  if (typeof email !== "string" || !email.includes("@")) redirect("/signin");
  return (
    <AuthShell>
      <CheckEmail email={email} />
    </AuthShell>
  );
}
