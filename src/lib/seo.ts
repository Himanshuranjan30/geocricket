import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb, schema } from "@/db";
import { fame } from "./seen";
import { openIds } from "./server";

// Public, crawlable content: every cricket moment whose answer can't come up in a scored game again (lib/server openIds), grouped into ground and
// player hub pages. Hubs need MIN_HUB moments so no page is thin. Cached for an hour (the pool changes daily).
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://geocricket.app";
export const MIN_HUB = 3;

export type Moment = { indexed: boolean; origin: string; id: string; text: string; answer: string; when: string; lat: number; lng: number; story: string; source: string; player: string | null; ground: string };

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
/** The ground's own name (drop the ", City" tail for the hub title). */
export const groundName = (answer: string) => answer.split(",")[0].trim();
// "Where did X score/take …?" (Cricsheet) or a Wikidata birthplace ("This is where X, the …, was born." / "X played for …").
const playerOf = (text: string) => text.match(/^Where did (.+?) (?:score|take) /)?.[1]
  ?? text.match(/^(?:This is where )?(.+?)(?:, (?:the|who) [^,]+,)? (?:was born|played for .+?, but was born)/)?.[1] ?? null;

export const publicMoments = unstable_cache(async (): Promise<Moment[]> => {
  const db = await getDb();
  const open = await openIds(); // never publish an answer that could still come up in a scored game or rated 1v1
  const rows = await db.select().from(schema.questions).where(eq(schema.questions.status, "live"));
  const pub = rows.filter((q) => open.has(q.id));
  const released = new Set(pub.filter((q) => q.origin === "cricsheet").sort((a, b) => fame(b) - fame(a) || a.id.localeCompare(b.id)).slice(0, INDEX_BATCH).map((q) => q.id));
  return pub.map((q) => ({
    indexed: q.origin !== "cricsheet" || released.has(q.id),
    origin: q.origin, id: q.id, text: q.text, answer: q.answer, when: q.when, lat: q.lat, lng: q.lng, story: q.story, source: q.source, player: playerOf(q.text), ground: groundName(q.answer),
  }));
}, ["seo-public-moments"], { revalidate: 3600 });

type Hub = { slug: string; name: string; moments: Moment[] };
function hubs(moments: Moment[], key: (m: Moment) => string | null): Hub[] {
  const by = new Map<string, Hub>();
  for (const m of moments) {
    const name = key(m); if (!name) continue;
    const s = slug(name);
    const h = by.get(s) ?? { slug: s, name, moments: [] };
    h.moments.push(m); by.set(s, h);
  }
  return [...by.values()].filter((h) => h.moments.length >= MIN_HUB).sort((a, b) => b.moments.length - a.moments.length);
}
export const groundHubs = async () => hubs(await publicMoments(), (m) => m.ground);
export const playerHubs = async () => hubs(await publicMoments(), (m) => m.player);
export async function momentById(id: string) { return (await publicMoments()).find((m) => m.id === id) ?? null; }

/** JSON-LD script tag content (escaped so it can't break out of the script element). */
export const ld = (data: object) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
export const breadcrumb = (items: [string, string][]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path}` })),
});

/** How many generated (Cricsheet) moments are released for indexing, best-known first. Raise it batch by batch once
 * Search Console shows the previous batch indexed (Google's scaled-content policy punishes publishing everything at once). */
export const INDEX_BATCH = Number(process.env.SEO_MOMENT_BATCH ?? 0);
export const indexable = (m: Moment) => m.indexed;
