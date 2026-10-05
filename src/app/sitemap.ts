import type { MetadataRoute } from "next";
import { pastDates } from "@/lib/server";
import { groundHubs, playerHubs, publicMoments, SITE } from "@/lib/seo";

export const revalidate = 3600;

// Every public page: the game, hubs (grounds, players), each cricket moment, and past daily rounds.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // lastModified only where it's true (daily-changing pages); Google discounts lastmod that's always "now".
  const today = new Date(new Date().toISOString().slice(0, 10));
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") =>
    ({ url: `${SITE}${path}`, ...(changeFrequency === "daily" ? { lastModified: today } : {}), changeFrequency, priority });
  const [moments, grounds, players, dates] = await Promise.all([publicMoments(), groundHubs(), playerHubs(), pastDates().catch(() => [] as string[])]);
  return [
    page("/", 1, "daily"), page("/mystery", 0.95, "daily"), page("/mystery/duel", 0.8), page("/mystery/host", 0.7), page("/play", 0.9, "daily"), page("/cups", 0.8, "daily"), page("/live", 0.7), page("/nets", 0.7),
    page("/leaderboard", 0.6, "daily"), page("/prize", 0.9, "daily"), page("/grounds", 0.8), page("/players", 0.8), page("/moments", 0.8),
    page("/how-it-works", 0.5, "monthly"), page("/about", 0.4, "monthly"), page("/archive", 0.5, "daily"), page("/locker", 0.4),
    ...grounds.map((g) => page(`/grounds/${g.slug}`, 0.7)),
    ...players.map((p) => page(`/players/${p.slug}`, 0.7)),
    ...moments.filter((m) => m.indexed).map((m) => ({ url: `${SITE}/moments/${m.id}`, changeFrequency: "yearly" as const, priority: 0.5 })),
    ...dates.map((d) => page(`/archive/${d}`, 0.3, "monthly")),
  ];
}
