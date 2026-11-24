import { cookies } from "next/headers";
import { cache } from "react";
import { referralCodeExists } from "@/lib/account/store";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/account/types";

export const validReferralCode = cache(async (code: string | undefined) => {
  const normalized = normalizeReferralCode(code);
  return normalized && (await referralCodeExists(normalized)) ? normalized : null;
});

export const referralFromCookie = cache(async () => validReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value));
