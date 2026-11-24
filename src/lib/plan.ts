import {
  CalendarClock,
  Gauge,
  Handshake,
  Languages,
  Newspaper,
  Plug,
  Radio,
  Sparkles,
  Stamp,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Mirrors site/lib/account/plans.ts, the source of truth on nootle.ai.

export type PlanInterval = "monthly" | "yearly" | "lifetime";

export interface PriceOption {
  interval: PlanInterval;
  label: string;
  /** Whole US dollars. */
  price: number;
  cadence: string;
}

export const PRICES: PriceOption[] = [
  { interval: "monthly", label: "Monthly", price: 5, cadence: "/month" },
  { interval: "yearly", label: "Yearly", price: 40, cadence: "/year" },
  { interval: "lifetime", label: "Lifetime", price: 99, cadence: "once" },
];

export const TRIAL_DAYS = 14;
export const REFERRAL_DISCOUNT_PERCENT = 30;
export const REFERRAL_REWARD_DAYS = 30;

export type ProFeatureId =
  | "live-assist"
  | "workflows"
  | "actions"
  | "commitments"
  | "brief"
  | "digest"
  | "coach"
  | "room"
  | "translate"
  | "ai-connector"
  | "share-branding";

export interface ProFeature {
  name: string;
  value: string;
  icon: LucideIcon;
}

/** In the order the upgrade dialog lists them. */
export const PRO_FEATURES: Record<ProFeatureId, ProFeature> = {
  "live-assist": { name: "Live Assist", value: "Answers and reminders while the call is still going.", icon: Sparkles },
  workflows: { name: "Workflows", value: "Notes sent to Slack, Notion, Linear and more after each call.", icon: Workflow },
  actions: { name: "Ask Nootle actions", value: "Ask Nootle files the issue for you, straight from the chat.", icon: Zap },
  commitments: { name: "Commitment tracker", value: "Who promised what, and whether it happened.", icon: Handshake },
  brief: { name: "Pre-meeting brief", value: "Walk in knowing who's coming and what's still open.", icon: CalendarClock },
  digest: { name: "Daily digest recap", value: "Your day of meetings, read back in a few sentences.", icon: Newspaper },
  coach: { name: "Meeting Coach", value: "How you show up: talk share, questions, pace.", icon: Gauge },
  room: { name: "Ask the Room", value: "Answers in the voices of the people who said it.", icon: Radio },
  translate: { name: "Translate", value: "Read any meeting in your language.", icon: Languages },
  "ai-connector": { name: "AI connector", value: "Claude and ChatGPT read the meetings you share.", icon: Plug },
  "share-branding": { name: "Unbranded share links", value: "Share notes without “Made with Nootle”.", icon: Stamp },
};

export const PRO_FEATURE_IDS = Object.keys(PRO_FEATURES) as ProFeatureId[];

/** "$3.33" a month for yearly, to compare with monthly. */
export const monthlyEquivalent = (p: PriceOption) => `$${(p.price / 12).toFixed(2)}`;
