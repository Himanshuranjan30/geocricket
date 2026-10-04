import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { MomentList } from "@/components/MomentList";
import { Page } from "@/components/Page";
import { breadcrumb, groundHubs, indexable, ld, momentById, playerHubs, slug } from "@/lib/seo";

export const revalidate = 3600;

// A cricket moment that's already public (never one in a live or upcoming round, so answers never leak).
export async function generateMetadata({ params }: PageProps<"/moments/[id]">): Promise<Metadata> {
  const m = await momentById((await params).id);
  if (!m) return {};
  const title = m.player ? (m.text.startsWith("Where did ") ? `${m.text.replace(/^Where did /, "").replace(/\?$/, "")}: ${m.ground}` : `${m.player}'s birthplace: ${m.answer}`) : `${m.answer}: ${m.when}`;
  // Generated (Cricsheet) moments stay out of the index until released in batches (scaled-content policy); hubs carry them.
  return { title, description: `${m.story} Answer: ${m.answer}. Play it on GeoCricket, the daily cricket geography game.`.slice(0, 300), alternates: { canonical: `/moments/${m.id}` },
    robots: indexable(m) ? undefined : { index: false, follow: true } };
}

export default async function Moment({ params }: PageProps<"/moments/[id]">) {
  const m = await momentById((await params).id);
  if (!m) notFound();
  const [grounds, players] = await Promise.all([groundHubs(), playerHubs()]);
  const ground = grounds.find((g) => g.slug === slug(m.ground)), player = m.player ? players.find((p) => p.slug === slug(m.player!)) : undefined;
  const related = [...(ground?.moments ?? []), ...(player?.moments ?? [])].filter((x, i, a) => x.id !== m.id && a.findIndex((y) => y.id === x.id) === i).slice(0, 6);
  return (
    <Page title={m.answer} eyebrow={m.when}>
      <script type="application/ld+json" dangerouslySetInnerHTML={ld([
        breadcrumb([["GeoCricket", "/"], ["Moments", "/moments"], ...(ground ? [[ground.name, `/grounds/${ground.slug}`] as [string, string]] : []), [m.answer, `/moments/${m.id}`]]),
      ])} />
      <p className="text-lg text-cream">{m.text}</p>
      <p>{m.story}</p>
      <p className="text-sm text-muted">
        {ground ? <Link href={`/grounds/${ground.slug}`}>{m.answer}</Link> : m.answer} · {m.lat.toFixed(4)}°, {m.lng.toFixed(4)}°
        {player && <> · <Link href={`/players/${player.slug}`}>More {player.name} moments</Link></>} · <a href={m.source} target="_blank" rel="noopener">Source</a>
      </p>
      <AdSlot slot={process.env.NEXT_PUBLIC_AD_SLOT_MOMENTS} height={250} />
      <Link href="/play" className="btn-primary self-start px-5 py-3 text-lg !no-underline">Play today&apos;s round →</Link>
      {related.length > 0 && <><h2>Related moments</h2><MomentList moments={related} show="both" /></>}
    </Page>
  );
}
