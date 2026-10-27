"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { isSharePage } from "@/lib/share-page";

export function SiteAnalytics() {
  const pathname = usePathname();
  if (isSharePage(pathname)) return null;
  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-K64K8YZZ42" strategy="afterInteractive" />
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-K64K8YZZ42');
        `}
      </Script>
      <Analytics beforeSend={(event) => (isSharePage(new URL(event.url).pathname) ? null : event)} />
    </>
  );
}
