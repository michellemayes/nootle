import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cardClass } from "@/components/ui";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          background:
            "radial-gradient(50% 55% at 50% 0%, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent 70%)",
        }}
      />
      <Link
        href="/"
        className="group mb-8 flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <Image
          src="/nootle-icon.svg"
          alt=""
          width={40}
          height={40}
          priority
          className="transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110"
        />
        <span className="font-[family-name:var(--font-outfit)] text-xl font-bold text-[var(--color-text)]">Nootle</span>
      </Link>
      <div className={`${cardClass} w-full max-w-md p-7 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.8)] sm:p-9`}>{children}</div>
    </main>
  );
}

export const authHeading = "font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl";

export function ExpiredAppLink() {
  return (
    <AuthShell>
      <h1 className={authHeading}>This link has expired</h1>
      <p className="mt-3 text-[var(--color-text-secondary)]">Open Nootle and choose Sign in again from Settings → Plan.</p>
    </AuthShell>
  );
}
