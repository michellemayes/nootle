import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nootle - AI Meeting Recorder for Mac",
  description:
    "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
  openGraph: {
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
    type: "website",
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
