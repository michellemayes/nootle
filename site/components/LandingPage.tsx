import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { CopyCommand } from "@/components/CopyCommand";
import { DownloadButton } from "@/components/DownloadButton";
import { outfit } from "@/components/site-config";

export type LandingContent = {
  /** Short label above the headline, e.g. "Granola alternative". */
  eyebrow: string;
  headline: string;
  subhead: string;
  why: {
    heading: string;
    points: { title: string; body: string }[];
  };
  /** Optional table; the first column holds row labels. */
  table?: {
    heading: string;
    intro?: string;
    columns: string[];
    rows: string[][];
    note?: string;
  };
  faqs: { question: string; answer: string }[];
  /** One-line reminder shown above the download section. */
  disclaimer?: string;
};

/** Page metadata for a landing page, keeping the site's Open Graph image and Twitter card. */
export function landingMetadata({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: "website",
      url: path,
      siteName: "Nootle",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export function LandingPage({ content }: { content: LandingContent }) {
  const { eyebrow, headline, subhead, why, table, faqs, disclaimer } = content;

  return (
    <>
      <Navbar />
      <main id="main-content" className="relative overflow-hidden">
        <section aria-label="Introduction" className="pt-36 pb-20 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-4">
              {eyebrow}
            </p>
            <h1
              className={`${outfit} text-4xl md:text-6xl font-extrabold tracking-tight mb-6 text-[var(--color-text)]`}
            >
              {headline}
            </h1>
            <p className="text-lg md:text-xl text-[var(--color-text-secondary)] mb-10 max-w-2xl mx-auto">
              {subhead}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <DownloadButton />
              <a
                href="#install"
                className="text-sm text-[var(--color-text-secondary)] underline hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-sm"
              >
                Or install with Homebrew
              </a>
            </div>
          </div>
        </section>

        <section aria-labelledby="why-heading" className="py-20 px-6 bg-[var(--color-surface)]">
          <div className="max-w-3xl mx-auto">
            <h2
              id="why-heading"
              className={`${outfit} text-3xl md:text-4xl font-bold mb-12 text-[var(--color-text)]`}
            >
              {why.heading}
            </h2>
            <ol className="space-y-10">
              {why.points.map((point, i) => (
                <li key={point.title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span
                    aria-hidden="true"
                    className={`${outfit} text-2xl font-bold text-[var(--color-accent)] tabular-nums`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className={`${outfit} text-xl font-bold mb-2 text-[var(--color-text)]`}>
                      {point.title}
                    </h3>
                    <p className="text-[var(--color-text-secondary)] leading-relaxed">{point.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {table && (
          <section aria-labelledby="table-heading" className="py-20 px-6">
            <div className="max-w-4xl mx-auto">
              <h2
                id="table-heading"
                className={`${outfit} text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text)]`}
              >
                {table.heading}
              </h2>
              {table.intro && (
                <p className="text-[var(--color-text-secondary)] mb-8 max-w-2xl">{table.intro}</p>
              )}
              <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--color-surface-elevated)]">
                    <tr>
                      {table.columns.map((col, i) => (
                        <th
                          key={col}
                          scope="col"
                          className={`${outfit} px-5 py-4 font-semibold ${
                            i === 1 ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"
                          }`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map(([label, ...cells]) => (
                      <tr key={label} className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                        <th scope="row" className="px-5 py-4 font-semibold text-[var(--color-text)] align-top">
                          {label}
                        </th>
                        {cells.map((cell, i) => (
                          <td
                            key={i}
                            className={`px-5 py-4 align-top ${
                              i === 0 ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.note && (
                <p className="mt-4 text-xs text-[var(--color-text-secondary)]">{table.note}</p>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="faq-heading" className="py-20 px-6 bg-[var(--color-surface)]">
          <div className="max-w-3xl mx-auto">
            <h2
              id="faq-heading"
              className={`${outfit} text-3xl md:text-4xl font-bold mb-10 text-[var(--color-text)]`}
            >
              Questions
            </h2>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]"
                >
                  <summary className="flex items-center justify-between gap-4 p-6 cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-2xl">
                    <h3 className={`${outfit} text-lg font-semibold text-[var(--color-text)]`}>
                      {faq.question}
                    </h3>
                    <ChevronDown
                      aria-hidden="true"
                      className="w-5 h-5 shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <p className="px-6 pb-6 text-[var(--color-text-secondary)] leading-relaxed">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="install" aria-labelledby="install-heading" className="py-24 px-6">
          <div className="max-w-2xl mx-auto text-center">
            {disclaimer && (
              <p className="mb-12 text-sm text-[var(--color-text-secondary)] border-l-2 border-[var(--color-accent)] pl-4 text-left">
                {disclaimer}
              </p>
            )}
            <h2
              id="install-heading"
              className={`${outfit} text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text)]`}
            >
              Try Nootle free
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-8">
              Free and open source under the MIT license. Requires macOS 14 or later on Apple Silicon.
            </p>
            <DownloadButton />
            <p className="mt-10 mb-3 text-sm text-[var(--color-text-secondary)]">Or install with Homebrew:</p>
            <CopyCommand />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
