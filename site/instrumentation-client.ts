import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";
import { isSharePage } from "@/lib/share-page";

// Share pages promise no analytics, so the SDK doesn't even start on them.
if (!isSharePage(location.pathname)) Sentry.init(sentryOptions);

// A no-op while tracing is off (tracesSampleRate 0); the SDK expects it.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
