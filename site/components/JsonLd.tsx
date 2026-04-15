import { faqs } from "@/components/faq-data";

const SITE_URL = "https://nootle.ai";
const SITE_NAME = "Nootle";

const softwareApplication = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  description:
    "AI-powered meeting recorder for Mac. Real-time transcription, speaker identification, and AI chat. All local, all private.",
  url: SITE_URL,
  operatingSystem: "macOS",
  applicationCategory: "BusinessApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  downloadUrl: "https://github.com/michellemayes/nootle/releases",
  featureList: [
    "Real-time transcription",
    "Speaker identification",
    "AI summaries and chat",
    "Local and private processing",
    "Noise cancellation",
    "Search across meetings",
    "Auto-detection of Zoom, Teams, Google Meet",
    "Linear integration",
    "CLI and developer tools",
    "MCP server for AI assistants",
  ],
  isAccessibleForFree: true,
  author: {
    "@type": "Person",
    name: "Michelle Mayes",
    url: "https://michellemayes.me",
    sameAs: ["https://github.com/michellemayes"],
  },
});

const webSite = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
});

const breadcrumbList = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
  ],
});

const faqPage = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});

export function JsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: softwareApplication }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: webSite }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbList }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqPage }}
      />
    </>
  );
}
