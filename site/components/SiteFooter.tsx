import Link from "next/link";
import { Fragment } from "react";

type FooterLink = { label: string; href: string };

const linkClass =
  "underline hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-sm";

const rows: { label: string; links: FooterLink[] }[] = [
  {
    label: "Made by",
    links: [
      { label: "Michelle Mayes", href: "https://michellemayes.me" },
      { label: "GitHub", href: "https://github.com/michellemayes/nootle" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
  {
    label: "Compare:",
    links: [
      { label: "Granola alternative", href: "/granola-alternative" },
      { label: "Otter alternative", href: "/otter-alternative" },
    ],
  },
  {
    label: "Nootle for:",
    links: [
      { label: "Lawyers", href: "/for/lawyers" },
      { label: "Therapists", href: "/for/therapists" },
      { label: "Researchers", href: "/for/researchers" },
    ],
  },
];

function FooterAnchor({ label, href }: FooterLink) {
  return href.startsWith("/") ? (
    <Link href={href} className={linkClass}>
      {label}
    </Link>
  ) : (
    <a href={href} className={linkClass}>
      {label}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="py-8 px-6 text-center text-[var(--color-text-secondary)] text-sm space-y-2">
      {rows.map((row) => (
        <p key={row.label}>
          {row.label}{" "}
          {row.links.map((link, j) => (
            <Fragment key={link.href}>
              {j > 0 && <> &middot; </>}
              <FooterAnchor {...link} />
            </Fragment>
          ))}
        </p>
      ))}
    </footer>
  );
}
