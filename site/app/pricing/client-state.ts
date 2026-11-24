import { useSyncExternalStore } from "react";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/account/types";

const subscribe = () => () => {};

const hasReferral = () =>
  normalizeReferralCode(
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${REFERRAL_COOKIE}=`))
      ?.slice(REFERRAL_COOKIE.length + 1),
  ) !== null;

const checkoutUnavailable = () => new URLSearchParams(window.location.search).get("unavailable") === "1";

export const useReferralDiscount = () => useSyncExternalStore(subscribe, hasReferral, () => false);
export const useCheckoutUnavailable = () => useSyncExternalStore(subscribe, checkoutUnavailable, () => false);
