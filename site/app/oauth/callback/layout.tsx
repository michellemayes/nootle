import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signing in - Nootle",
  robots: { index: false, follow: false },
};

export default function OAuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
