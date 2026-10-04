// Birthplace questions from Wikidata (CC0): cricketers known well enough to have 7+ Wikipedia language editions, pinned at
// their place of birth's coordinates. Skips pins that are a whole country or state (those coordinates are a centroid).
// Input: content/wikidata/births-raw.json (SPARQL JSON, see the query below). Output: content/wikidata/candidates.json
// Usage: node scripts/wikidata-births.mjs   (fetches the raw file first if it is missing)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "content/wikidata", RAW = `${DIR}/births-raw.json`, MIN_LINKS = 7;
const QUERY = `SELECT ?p ?pLabel ?pDescription ?place ?placeLabel ?coord ?countryLabel ?links ?born
  (GROUP_CONCAT(DISTINCT ?sportLabel; separator="|") AS ?teams) (GROUP_CONCAT(DISTINCT STR(?ptype); separator=",") AS ?types) WHERE {
  ?p wdt:P106 wd:Q12299841; wdt:P19 ?place; wikibase:sitelinks ?links . FILTER(?links >= 6)
  ?place wdt:P625 ?coord .
  OPTIONAL { ?p wdt:P569 ?born } OPTIONAL { ?place wdt:P17 ?country } OPTIONAL { ?place wdt:P31 ?ptype }
  OPTIONAL { ?p wdt:P1532 ?sport . ?sport rdfs:label ?sportLabel . FILTER(LANG(?sportLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?p ?pLabel ?pDescription ?place ?placeLabel ?coord ?countryLabel ?links ?born`;
if (!existsSync(RAW)) {
  mkdirSync(DIR, { recursive: true });
  const r = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`, { headers: { Accept: "application/sparql-results+json", "User-Agent": "GeoCricket/1.0 (question research; https://geocricket.app)" } });
  writeFileSync(RAW, await r.text());
}

// Country, sovereign state, constituent country, US state, Indian state, province, first-level admin division, island nation.
const AREA = /Q6256\b|Q3624078\b|Q3336843\b|Q35657\b|Q131541\b|Q34876\b|Q10864048\b|Q112099\b|Q7275\b/;
const v = (x, k) => x[k]?.value ?? "";
const DEMONYM = { Australia: "Australian", India: "Indian", England: "English", "New Zealand": "New Zealand", "South Africa": "South African", Pakistan: "Pakistani",
  "Sri Lanka": "Sri Lankan", Zimbabwe: "Zimbabwe", Bangladesh: "Bangladeshi", Afghanistan: "Afghan", Ireland: "Irish", Scotland: "Scottish", Wales: "Welsh",
  Netherlands: "Dutch", "West Indies": "West Indian", Kenya: "Kenyan", Canada: "Canadi", Namibia: "Namibian", Nepal: "Nepal", "United Arab Emirates": "Emirati", "United States": "American" };
const SUBCONTINENT = /^(India|Pakistan|Bangladesh)$/;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const HISTORIC = /British Raj|Empire|Presidency|Dominion of|^Punjab /; // a polity or a whole province, not a place you can pin
const COUNTRY = { "Kingdom of England": "England", "Kingdom of Great Britain": "Great Britain", "United Kingdom of Great Britain and Ireland": "United Kingdom" };
const seen = new Set(), out = [];
for (const x of JSON.parse(readFileSync(RAW, "utf8")).results.bindings) {
  const qid = v(x, "p").split("/").pop(), name = v(x, "pLabel"), place = v(x, "placeLabel"), country = COUNTRY[v(x, "countryLabel")] ?? v(x, "countryLabel");
  if (HISTORIC.test(`${place} ${country}`)) continue;
  const links = Number(v(x, "links"));
  if (links < MIN_LINKS || seen.has(qid) || /^Q\d+$/.test(name) || /^Q\d+$/.test(place) || !name.includes(" ")) continue;
  if (AREA.test(v(x, "types")) || place === country) continue;
  const [lng, lat] = v(x, "coord").match(/-?[\d.]+/g)?.map(Number) ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  seen.add(qid);
  const desc = v(x, "pDescription").replace(/\s*\(.*?\)/g, "").trim();
  if (!/cricket/i.test(desc)) continue; // known for cricket, not a novelist or footballer who once played
  // Wikidata's "country for sport" is sometimes wrong (Bob Simpson → Bermuda): trust it only when the description agrees.
  const team = v(x, "teams").split("|").filter((t) => t && !/Kingdom/.test(t) && (DEMONYM[t] ? desc.includes(DEMONYM[t]) : !/^[A-Z][a-z]+ (women's )?cricketer/.test(desc)))[0] ?? "";
  const adj = desc.match(/^([A-Z][\w ]{2,30}?) (women's )?cricket(er| umpire)\b/); // "English cricketer and commentator" → English
  const who = adj ? `the ${adj[1]} ${adj[2] ?? ""}cricket${adj[3]}` : team ? `who played for ${team}` : "";
  const year = v(x, "born").slice(0, 4);
  const answer = country && !place.includes(country) ? `${place}, ${country}` : place;
  // Born abroad is the best version of this question: say so, it is the hook.
  const abroad = team && country && !place.includes(team) && !country.includes(team) && !team.includes(country) && !(/^(England|Scotland|Wales|Ireland)$/.test(team) && /United Kingdom|Kingdom of England|Ireland/.test(country)) && team !== "West Indies"
    && !(SUBCONTINENT.test(team) && SUBCONTINENT.test(country) && Number(v(x, "born").slice(0, 4)) < 1948); // partition: same country then
  const text = abroad ? `${name} played for ${team}, but was born here.`
    : [`${name}${who ? `, ${who},` : ""} was born here.`, `This is where ${name}${who ? `, ${who},` : ""} was born.`][hash(qid) % 2];
  out.push({ id: `wd-birth-${qid}`, text, answer, when: year ? `Born ${year}` : "", lat, lng, scaleKm: 500, score: links / 10 + (abroad ? 0.5 : 0),
    story: `${name} was born in ${answer}${year ? ` in ${year}` : ""}.`, source: `https://www.wikidata.org/wiki/${qid}`, region: country === "India" ? "india" : "global" });
}
out.sort((a, b) => b.score - a.score);
writeFileSync(`${DIR}/candidates.json`, JSON.stringify(out));
console.log(`${out.length} birthplace questions (${out.filter((q) => q.text.includes("but was born")).length} born abroad)`);
