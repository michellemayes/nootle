import Image from "next/image";
import Link from "next/link";
import { AppleLogo } from "@/components/AppleLogo";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQ", href: "/#faq" },
];

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <Image
            src="/nootle-icon.svg"
            alt="Nootle home"
            width={36}
            height={36}
            priority
          />
          <span className="font-[family-name:var(--font-outfit)] font-bold text-lg text-[var(--color-text)]">
            Nootle
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors duration-150"
              >
                {link.label}
              </a>
            ))}
          </div>
          <a
            href="https://github.com/michellemayes/nootle/releases"
            className="inline-flex items-center px-5 py-2 text-sm font-semibold rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_20px_-4px_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <AppleLogo className="w-3.5 h-3.5 mr-1.5" />
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
