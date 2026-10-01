import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { breadcrumb, ld, playerHubs } from "@/lib/seo";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Cricketers and where their greatest performances happened",
  description: "Virat Kohli, Joe Root, Kumar Sangakkara, Rohit Sharma and more: the grounds behind every big innings and spell. Guess them on the globe in GeoCricket.",
  alternates: { canonical: "/players" },
};

export default async function Players() {
  const players = await playerHubs();
  return (
    <Page title="Players" eyebrow={`${players.length} cricketers`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(breadcrumb([["GeoCricket", "/"], ["Players", "/players"]]))} />
      <p className="text-lg text-cream">Where did your favourite cricketers make history? Each page maps a player&apos;s standout innings and spells to the grounds where they happened.</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {players.map((p) => (
          <li key={p.slug}><Link href={`/players/${p.slug}`} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 !text-cream !no-underline ring-1 ring-white/10 hover:bg-white/10">
            <span className="truncate">{p.name}</span><span className="ml-2 shrink-0 text-xs text-muted">{p.moments.length} moments</span></Link></li>
        ))}
      </ul>
    </Page>
  );
}
