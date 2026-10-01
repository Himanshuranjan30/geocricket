import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { MomentList } from "@/components/MomentList";
import { Page } from "@/components/Page";
import { breadcrumb, groundHubs, ld, SITE } from "@/lib/seo";

export const revalidate = 3600;
const years = (ms: { when: string }[]) => { const y = ms.map((m) => Number(m.when.match(/\d{4}/)?.[0])).filter(Boolean).sort(); return y.length ? [y[0], y[y.length - 1]] : null; };
async function find(s: string) { return (await groundHubs()).find((g) => g.slug === s) ?? null; }

export async function generateMetadata({ params }: PageProps<"/grounds/[slug]">): Promise<Metadata> {
  const g = await find((await params).slug);
  if (!g) return {};
  const y = years(g.moments), city = g.moments[0].answer.split(",").slice(1).join(",").trim();
  return {
    title: `${g.name}${city ? `, ${city}` : ""}: ${g.moments.length} famous cricket moments`,
    description: `${g.moments.length} standout moments at ${g.name}${y ? ` from ${y[0]} to ${y[1]}` : ""}: centuries, five-fors and finals. Can you place them on the globe? Play GeoCricket free.`,
    alternates: { canonical: `/grounds/${g.slug}` },
  };
}

export default async function Ground({ params }: PageProps<"/grounds/[slug]">) {
  const g = await find((await params).slug);
  if (!g) notFound();
  const m0 = g.moments[0], y = years(g.moments);
  const players = [...new Set(g.moments.map((m) => m.player).filter(Boolean))] as string[];
  const list = [...g.moments].sort((a, b) => (b.when.match(/\d{4}/)?.[0] ?? "").localeCompare(a.when.match(/\d{4}/)?.[0] ?? ""));
  return (
    <Page title={g.name} eyebrow={`Cricket ground · ${m0.answer.split(",").slice(1).join(",").trim() || "venue"}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={ld([
        { "@context": "https://schema.org", "@type": "StadiumOrArena", name: g.name, address: m0.answer, geo: { "@type": "GeoCoordinates", latitude: m0.lat, longitude: m0.lng }, url: `${SITE}/grounds/${g.slug}` },
        { "@context": "https://schema.org", "@type": "ItemList", name: `Famous cricket moments at ${g.name}`, numberOfItems: g.moments.length,
          itemListElement: list.slice(0, 50).map((m, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/moments/${m.id}`, name: m.story || m.text })) },
        breadcrumb([["GeoCricket", "/"], ["Grounds", "/grounds"], [g.name, `/grounds/${g.slug}`]]),
      ])} />
      <p className="text-lg text-cream">
        {g.name} has seen {g.moments.length} of the standout moments in the GeoCricket archive{y ? `, from ${y[0]} to ${y[1]}` : ""}
        {players.length ? `, with performances from ${players.slice(0, 3).join(", ")}${players.length > 3 ? ` and ${players.length - 3} more` : ""}` : ""}.
        Every one is a question in the game: spin the globe and tap where it happened.
      </p>
      <p className="text-sm text-muted">Location: {m0.lat.toFixed(4)}°, {m0.lng.toFixed(4)}°</p>
      <Link href="/play" className="btn-primary self-start px-5 py-3 text-lg !no-underline">Play today&apos;s round →</Link>
      <AdSlot slot={process.env.NEXT_PUBLIC_AD_SLOT_HUBS} />
      <h2>Moments at {g.name}</h2>
      <MomentList moments={list} show="player" />
      <p className="text-sm"><Link href="/grounds">All cricket grounds</Link> · <Link href="/players">Players</Link> · <Link href="/moments">All moments</Link></p>
    </Page>
  );
}
