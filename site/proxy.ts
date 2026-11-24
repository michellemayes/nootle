import { NextResponse, type NextRequest } from "next/server";
import { REFERRAL_CODE, REFERRAL_COOKIE } from "@/lib/account/types";

const SIXTY_DAYS = 60 * 24 * 60 * 60;

/** /r/<code> remembers the friend's code for sign-up and checkout. */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const code = (request.nextUrl.pathname.split("/")[2] ?? "").toUpperCase();
  if (REFERRAL_CODE.test(code)) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      maxAge: SIXTY_DAYS,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = {
  matcher: "/r/:code",
};
