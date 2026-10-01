import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { breadcrumb, ld, publicMoments } from "@/lib/seo";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Cricket moments: famous innings, spells and finals, and where they happened",
  description: "A searchable archive of cricket's standout moments, from 400 not out to World Cup finals, each with its ground, date and story. Play them as a daily geography quiz.",
  alternates: { canonical: "/moments" },
};

export default async function Moments() {
  const all = await publicMoments();
  const byYear = new Map<string, typeof all>();
  for (const m of all) { const y = m.when.match(/\d{4}/)?.[0] ?? "Classic"; byYear.set(y, [...(byYear.get(y) ?? []), m]); }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
  return (
    <Page title="Cricket moments" eyebrow={`${all.length} moments`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(breadcrumb([["GeoCricket", "/"], ["Moments", "/moments"]]))} />
      <p className="text-lg text-cream">Every moment in GeoCricket, by year. Browse by <Link href="/grounds">ground</Link> or <Link href="/players">player</Link>, or play them as today&apos;s round.</p>
      {years.map((y) => (
        <section key={y}>
          <h2>{y}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {byYear.get(y)!.map((m) => <li key={m.id}><Link href={`/moments/${m.id}`}>{m.story ? m.story.split(". ")[0] : m.text}</Link></li>)}
          </ul>
        </section>
      ))}
    </Page>
  );
}
