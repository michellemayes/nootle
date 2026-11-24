import { PRICES, REFERRAL_DISCOUNT_PERCENT, priceFor, type PriceOption } from "@/lib/account/plans";

export const usd = (amount: number) =>
  `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

export const withReferralDiscount = (price: number) => Math.round(price * (100 - REFERRAL_DISCOUNT_PERCENT)) / 100;

/** What a subscription costs per month, or null for a one-off payment. */
export const monthlyEquivalent = ({ interval, price }: PriceOption) =>
  interval === "monthly" ? price : interval === "yearly" ? Math.floor((price / 12) * 100) / 100 : null;

/** Pro's cheapest monthly rate, e.g. "$3.33". */
export const PRO_FROM = usd(Math.min(...PRICES.map(monthlyEquivalent).filter((n): n is number => n !== null)));

export const NOOTLE_PRICE = `Free / Pro from ${PRO_FROM} a month`;

/** "$5 a month, $40 a year or $99 once" */
export const PRO_PRICE_SUMMARY = `${usd(priceFor("monthly").price)} a month, ${usd(priceFor("yearly").price)} a year or ${usd(priceFor("lifetime").price)} once`;
