import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-syne",
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
    images: ["/nootle-logo.png"],
  },
  twitter: {
    card: "summary",
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
  },
  icons: {
    icon: "/favicon.png",
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
