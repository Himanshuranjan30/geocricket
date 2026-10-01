import type { Metadata } from "next";
import { Page } from "@/components/Page";
import CREDITS from "@/content/legend-credits.json";
import { LEGENDS } from "@/lib/legends";

export const metadata: Metadata = { title: "About" };

export default function About() {
  return (
    <Page title="About GeoCricket" eyebrow="About">
      <p>GeoCricket is a free daily cricket geography game. Every question is a real moment from cricket history, written and fact-checked by us from public sources, with a link to the source on each story page.</p>
      <h2>Not affiliated</h2>
      <p>GeoCricket is an independent fan project. It is not affiliated with, endorsed by or sponsored by the BCCI, the IPL, the ICC, any cricket board, league, team or player. Tournament logos remain the property of their owners. Names of teams, tournaments and venues are used to describe historical facts.</p>
      <h2>Maps</h2>
      <p>International boundaries follow the Survey of India depiction. Satellite imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016). Place names and roads: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>, served by <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>. Country shapes from Natural Earth.</p>
      <h2>Spotted a mistake?</h2>
      <p>Cricket fans are precise, and so are we. If a fact or a location looks wrong, tell us and we&apos;ll fix it.</p>
      <h2>Data credits</h2>
      <p>Match data from <a href="https://cricsheet.org" target="_blank" rel="noopener">Cricsheet</a>, used under the Open Data Commons Attribution License. Ground locations from Wikidata and Wikipedia.</p>
      <p>Legend avatars are illustrations derived from photos on Wikimedia Commons; derivatives of CC BY-SA photos are shared under the same licence.</p>
      <ul className="columns-1 gap-6 text-xs sm:columns-2">
        {Object.entries(CREDITS as Record<string, { url: string; author: string; license: string }>).map(([id, c]) => (
          <li key={id}>{LEGENDS.find((l) => l.id === id)?.name ?? id}: <a href={c.url} target="_blank" rel="noopener">photo</a> by {c.author || "unknown"}, {c.license}</li>
        ))}
      </ul>
    </Page>
  );
}
