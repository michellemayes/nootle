import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export function register() {
  Sentry.init(sentryOptions);
}

/** Errors thrown while rendering or in route handlers. */
export const onRequestError = Sentry.captureRequestError;
