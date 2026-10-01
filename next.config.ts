import type { NextConfig } from "next";

const week = "public, max-age=604800, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@electric-sql/pglite"],
  // Static game assets rarely change: let browsers and the CDN keep them for a week.
  async headers() {
    return ["/maplibre/:path*", "/flags/:path*", "/logos/:path*", "/world.topo.json", "/globe-poster.webp"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: week }],
    }));
  },
};

export default nextConfig;
