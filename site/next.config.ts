import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    // Browser-based MCP clients sign in and call the MCP server cross-origin.
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, Mcp-Protocol-Version" },
      { key: "Access-Control-Expose-Headers", value: "WWW-Authenticate" },
    ];
    return ["/mcp/:path*", "/api/oauth/:path*", "/.well-known/:path*"].map((source) => ({ source, headers: cors }));
  },
  async rewrites() {
    // Link previews scraped before the image moved to app/opengraph-image.png still point here.
    return [{ source: "/og-image.png", destination: "/opengraph-image.png" }];
  },
};

// Source maps upload to Sentry only when SENTRY_AUTH_TOKEN is set (on
// Vercel), and are deleted afterwards so they're never served.
export default withSentryConfig(nextConfig, {
  org: "michelle-mayes",
  project: "nootle-site",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Only errors are reported, so tracing and replay code is left out of the bundle.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
