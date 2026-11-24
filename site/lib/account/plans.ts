// Nootle Pro's prices and what Pro adds, used by the pricing page, the
// checkout route and the comparison table. Product ids come from the env so
// sandbox and production use the same code.

import type { PlanInterval } from "@/lib/account/types";

export interface PriceOption {
  interval: PlanInterval;
  label: string;
  /** Whole US dollars. */
  price: number;
  cadence: string;
  productEnv: string;
}

export const PRICES: PriceOption[] = [
  { interval: "monthly", label: "Monthly", price: 5, cadence: "/month", productEnv: "POLAR_PRODUCT_MONTHLY" },
  { interval: "yearly", label: "Yearly", price: 40, cadence: "/year", productEnv: "POLAR_PRODUCT_YEARLY" },
  { interval: "lifetime", label: "Lifetime", price: 99, cadence: "once", productEnv: "POLAR_PRODUCT_LIFETIME" },
];

/** Percent off a referred friend's first payment. */
export const REFERRAL_DISCOUNT_PERCENT = 30;
/** Pro days a referrer earns for each friend who pays. */
export const REFERRAL_REWARD_DAYS = 30;
export const TRIAL_DAYS = 14;

export const FREE_FEATURES = [
  "Unlimited recording, no bot in the call",
  "Transcription on your Mac, with speaker names",
  "Summaries, templates and action items",
  "Ask across your meetings and docs",
  "Notes, highlights and snapshots",
  "Share links, export and import",
  "CLI and MCP server for agents",
];

export const PRO_FEATURES = [
  "Live Assist and playbooks during calls",
  "Workflows to Slack, Notion, Linear and more",
  "Ask Nootle files issues and pages for you",
  "Commitment tracker",
  "Pre-meeting briefs and daily digest",
  "Meeting Coach",
  "Ask the Room and Translate",
  "AI connector for Claude and ChatGPT",
  "Share links without Nootle branding",
];

export const productIdFor = (interval: PlanInterval) =>
  process.env[PRICES.find((p) => p.interval === interval)!.productEnv];
