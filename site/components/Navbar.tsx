"use client";

import Image from "next/image";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/nootle-logo.png"
            alt="Nootle"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="font-[family-name:var(--font-syne)] font-bold text-lg text-[var(--color-text)]">
            Nootle
          </span>
        </div>
        <a
          href="https://github.com/michellemayes/nootle/releases"
          className="px-5 py-2 text-sm font-semibold rounded-full bg-[var(--color-mint)] text-[var(--color-bg)] hover:opacity-90 transition-opacity"
        >
          Download
        </a>
      </div>
    </nav>
  );
}
