import { NextResponse, type NextRequest } from "next/server";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/account/types";

const SIXTY_DAYS = 60 * 24 * 60 * 60;

/** /r/<code> remembers the friend's code for sign-up and checkout. */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const code = normalizeReferralCode(request.nextUrl.pathname.split("/")[2]);
  if (code) {
    // Readable by /pricing's script, which shows the discount; it's not a secret.
    response.cookies.set(REFERRAL_COOKIE, code, {
      maxAge: SIXTY_DAYS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = {
  matcher: "/r/:code",
};
