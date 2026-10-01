import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { breadcrumb, groundHubs, ld } from "@/lib/seo";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Famous cricket grounds and the moments they hosted",
  description: "Lord's, the MCG, Eden Gardens, Galle and more: every great cricket ground and its standout centuries, five-fors and finals. Guess where they happened in GeoCricket.",
  alternates: { canonical: "/grounds" },
};

export default async function Grounds() {
  const grounds = await groundHubs();
  return (
    <Page title="Cricket grounds" eyebrow={`${grounds.length} grounds`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(breadcrumb([["GeoCricket", "/"], ["Grounds", "/grounds"]]))} />
      <p className="text-lg text-cream">The grounds behind cricket&apos;s biggest moments. Pick one to see every innings, spell and final it hosted, then test yourself on the globe.</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {grounds.map((g) => (
          <li key={g.slug}><Link href={`/grounds/${g.slug}`} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 !text-cream !no-underline ring-1 ring-white/10 hover:bg-white/10">
            <span className="truncate">{g.name}</span><span className="ml-2 shrink-0 text-xs text-muted">{g.moments.length} moments</span></Link></li>
        ))}
      </ul>
    </Page>
  );
}
