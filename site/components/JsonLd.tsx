import { faqs } from "@/components/faq-data";
import { RELEASES_URL } from "@/components/site-config";

const SITE_URL = "https://nootle.ai";
const SITE_NAME = "Nootle";

const softwareApplication = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  description:
    "AI-powered meeting recorder for Mac. Records calls without a bot, transcribes on your Mac with speaker identification, and answers from your meetings and documents, even live during a call.",
  url: SITE_URL,
  operatingSystem: "macOS",
  applicationCategory: "BusinessApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  downloadUrl: RELEASES_URL,
  featureList: [
    "Real-time transcription on your Mac",
    "Speaker identification that remembers voices",
    "AI summaries and chat",
    "Local knowledge base of your documents",
    "Live Assist answers during calls",
    "Snapshots of shared screens",
    "Shorthand notes expanded into full notes",
    "Local-only mode and no telemetry",
    "Crash-safe recording",
    "Search across meetings and documents",
    "Meeting detection for Zoom, Teams, Webex, Slack, FaceTime, Discord, and browser calls",
    "Import recordings and transcripts from Otter, Fathom, Granola, Zoom, Teams, and Meet",
    "Workflows and integrations with Slack, Notion, Confluence, Linear, GitHub, Asana, Obsidian, and email",
    "Customizable summary templates that run automatically",
    "Use a Claude or ChatGPT subscription via the Claude Code and Codex CLIs",
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
