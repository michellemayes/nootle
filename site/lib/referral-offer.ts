import { cookies } from "next/headers";
import { findByReferralCode } from "@/lib/account/store";
import { REFERRAL_CODE, REFERRAL_COOKIE } from "@/lib/account/types";

export const normalizeReferralCode = (code: string | undefined) => {
  const upper = (code ?? "").trim().toUpperCase();
  return REFERRAL_CODE.test(upper) ? upper : null;
};

/** The referral code that belongs to a real account, or null. */
export async function validReferralCode(code: string | undefined) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  return (await findByReferralCode(normalized)) ? normalized : null;
}

/** The friend's code from the nootle_ref cookie, when it still belongs to an account. */
export async function referralFromCookie() {
  return validReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value);
}
