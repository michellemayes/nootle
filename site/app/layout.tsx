import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { JsonLd } from "@/components/JsonLd";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://nootle.ai"),
  title: "Nootle - AI Meeting Recorder for Mac",
  description:
    "Free, open-source AI meeting recorder for Mac. Real-time transcription, speaker identification, and AI chat — 100% local and private. Download free.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Free, open-source AI meeting recorder for Mac. Real-time transcription, speaker identification, and AI chat — 100% local and private.",
    type: "website",
    url: "https://nootle.ai",
    siteName: "Nootle",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nootle - AI Meeting Recorder for Mac",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Free, open-source AI meeting recorder for Mac. Real-time transcription, speaker identification, and AI chat — 100% local and private.",
    images: ["/og-image.png"],
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
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-K64K8YZZ42"
          strategy="afterInteractive"
        />
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-K64K8YZZ42');
          `}
        </Script>
      </head>
      <body className={`${outfit.variable} ${dmSans.variable} font-[family-name:var(--font-dm-sans)]`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--color-accent)] focus:text-[var(--color-bg)] focus:font-semibold focus:text-sm"
        >
          Skip to content
        </a>
        <JsonLd />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
