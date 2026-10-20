import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { JsonLd } from "@/components/JsonLd";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { MotionProvider } from "@/components/MotionProvider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const DESCRIPTION =
  "Free, open-source AI meeting recorder for Mac. No bot in your calls, transcription on your Mac, speaker identification, and AI answers from your meetings and docs.";

export const metadata: Metadata = {
  metadataBase: new URL("https://nootle.ai"),
  title: "Nootle - AI Meeting Recorder for Mac",
  description:
    `${DESCRIPTION} Download free.`,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      DESCRIPTION,
    type: "website",
    url: "https://nootle.ai",
    siteName: "Nootle",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      DESCRIPTION,
  },
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/site.webmanifest",
  other: {
    "theme-color": "#13111c",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The shared-note page sets its theme on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} ${dmSans.variable} font-[family-name:var(--font-dm-sans)]`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--color-accent)] focus:text-[var(--color-bg)] focus:font-semibold focus:text-sm"
        >
          Skip to content
        </a>
        <JsonLd />
        <MotionProvider>{children}</MotionProvider>
        <SiteAnalytics />
      </body>
    </html>
  );
}
