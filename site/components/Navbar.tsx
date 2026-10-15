"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { AppleLogo } from "@/components/AppleLogo";
import { RELEASES_URL } from "@/components/site-config";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Compare", href: "/#compare" },
  { label: "FAQ", href: "/#faq" },
];

export function Navbar() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 px-6 transition-[padding,background-color,border-color] duration-300 border-b ${
        scrolled
          ? "py-2.5 bg-[var(--color-bg)]/85 backdrop-blur-md border-[var(--color-border)]"
          : "py-4 bg-[var(--color-bg)]/60 backdrop-blur-sm border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <Image
            src="/nootle-icon.svg"
            alt="Nootle home"
            width={36}
            height={36}
            priority
            className="transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110"
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
                className="relative text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors duration-150 after:absolute after:left-0 after:-bottom-1 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-[var(--color-accent)] after:transition-transform after:duration-200 hover:after:scale-x-100"
              >
                {link.label}
              </a>
            ))}
          </div>
          <a
            href={RELEASES_URL}
            className="inline-flex items-center px-5 py-2 text-sm font-semibold rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_20px_-4px_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <AppleLogo className="w-3.5 h-3.5 mr-1.5" />
            Download
          </a>
        </div>
      </div>
      <motion.div
        aria-hidden="true"
        className="absolute left-0 right-0 -bottom-px h-0.5 origin-left bg-[var(--color-accent)]"
        style={{ scaleX: progress }}
      />
    </nav>
  );
}
