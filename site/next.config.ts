import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // Link previews scraped before the image moved to app/opengraph-image.png still point here.
    return [{ source: "/og-image.png", destination: "/opengraph-image.png" }];
  },
};

export default nextConfig;
