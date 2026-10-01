import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { MomentList } from "@/components/MomentList";
import { Page } from "@/components/Page";
import { breadcrumb, ld, playerHubs, SITE } from "@/lib/seo";

export const revalidate = 3600;
async function find(s: string) { return (await playerHubs()).find((p) => p.slug === s) ?? null; }

export async function generateMetadata({ params }: PageProps<"/players/[slug]">): Promise<Metadata> {
  const p = await find((await params).slug);
  if (!p) return {};
  const grounds = new Set(p.moments.map((m) => m.ground)).size;
  return {
    title: `${p.name}: ${p.moments.length} greatest performances and where they happened`,
    description: `${p.name}'s standout innings and spells across ${grounds} grounds, with scores, dates and venues. Guess where each happened in GeoCricket, the daily cricket geography game.`,
    alternates: { canonical: `/players/${p.slug}` },
  };
}

export default async function Player({ params }: PageProps<"/players/[slug]">) {
  const p = await find((await params).slug);
  if (!p) notFound();
  const list = [...p.moments].sort((a, b) => (b.when.match(/\d{4}/)?.[0] ?? "").localeCompare(a.when.match(/\d{4}/)?.[0] ?? ""));
  const grounds = [...new Set(list.map((m) => m.ground))];
  return (
    <Page title={p.name} eyebrow="Cricketer · where it happened">
      <script type="application/ld+json" dangerouslySetInnerHTML={ld([
        { "@context": "https://schema.org", "@type": "Person", name: p.name, jobTitle: "Cricketer", url: `${SITE}/players/${p.slug}` },
        { "@context": "https://schema.org", "@type": "ItemList", name: `${p.name}'s standout performances`, numberOfItems: list.length,
          itemListElement: list.slice(0, 50).map((m, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/moments/${m.id}`, name: m.story || m.text })) },
        breadcrumb([["GeoCricket", "/"], ["Players", "/players"], [p.name, `/players/${p.slug}`]]),
      ])} />
      <p className="text-lg text-cream">
        {list.length} of {p.name}&apos;s standout performances, across {grounds.length} grounds{grounds.length ? ` including ${grounds.slice(0, 3).join(", ")}` : ""}.
        Each one is a GeoCricket question: can you place them all on the globe?
      </p>
      <Link href="/play" className="btn-primary self-start px-5 py-3 text-lg !no-underline">Play today&apos;s round →</Link>
      <AdSlot slot={process.env.NEXT_PUBLIC_AD_SLOT_HUBS} />
      <h2>{p.name}&apos;s moments</h2>
      <MomentList moments={list} show="ground" />
      <p className="text-sm"><Link href="/players">All players</Link> · <Link href="/grounds">Grounds</Link> · <Link href="/moments">All moments</Link></p>
    </Page>
  );
}
