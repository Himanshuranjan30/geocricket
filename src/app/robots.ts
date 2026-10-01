import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Crawl everything public; keep APIs, admin and per-player pages out of the index.
const PRIVATE = ["/api/", "/admin", "/settings", "/profile", "/live/", "/duel/", "/cup/"];
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // Search thumbnails: keep Google's image crawler off decorative art (the globe poster, character renders, map
      // tiles), so the branded preview image and the logo are what represent GeoCricket in results.
      { userAgent: "Googlebot-Image", allow: ["/opengraph-image", "/logo-512.png", "/icon-512.png", "/icon.png", "/favicon.ico"], disallow: [...PRIVATE, "/globe-poster.webp", "/rig/", "/rig2/", "/hero/", "/legends/", "/tiles/", "/flags/", "/logos/"] },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
