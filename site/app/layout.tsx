import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  title: "Nootle - AI Meeting Recorder for Mac",
  description:
    "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
  openGraph: {
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
    type: "website",
    images: ["/favicon.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
  },
  icons: {
    icon: "/favicon.png",
  },
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
      <body className={`${outfit.variable} ${dmSans.variable} font-[family-name:var(--font-dm-sans)]`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--color-accent)] focus:text-[var(--color-bg)] focus:font-semibold focus:text-sm"
        >
          Skip to content
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
