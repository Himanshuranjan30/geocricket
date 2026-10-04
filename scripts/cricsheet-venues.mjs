// Resolves Cricsheet venues via Wikipedia search → article coordinates. Cached in content/cricsheet/venues.json.
// Also geocodes every venue with OpenStreetMap Nominatim (content/cricsheet/geocheck.json, 1 req/s) so the build can
// cross-check pins between sources. Usage: node scripts/cricsheet-venues.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
const DIR = "content/cricsheet", UA = { "User-Agent": "GeoCricket/1.0 (venue lookup; https://geocricket.app)" };
const cache = existsSync(`${DIR}/venues.json`) ? JSON.parse(readFileSync(`${DIR}/venues.json`, "utf8")) : {};
const venues = new Map();
for (const f of readdirSync(`${DIR}/json`)) {
  if (!f.endsWith(".json")) continue;
  try { const i = JSON.parse(readFileSync(`${DIR}/json/${f}`, "utf8")).info; if (i?.venue) venues.set(`${i.venue}|${i.city ?? ""}`, i); } catch {}
}
let done = 0, hit = 0;
for (const [key, i] of venues) {
  if (cache[key]) continue; // null = missed last time: retry with the plain venue name
  const q = key in cache ? i.venue : `${i.venue.split(",")[0]} ${i.city ?? ""} cricket ground`;
  try {
    const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(q)}`, { headers: UA })).json();
    const title = s.query?.search?.[0]?.title;
    let c = null;
    if (title) {
      const p = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&format=json&titles=${encodeURIComponent(title)}`, { headers: UA })).json();
      const co = Object.values(p.query.pages)[0].coordinates?.[0];
      if (co) c = { name: title, lat: co.lat, lng: co.lon };
    }
    cache[key] = c; if (c) hit++;
  } catch { /* left out of the cache: retried next run */ }
  if (++done % 50 === 0) { writeFileSync(`${DIR}/venues.json`, JSON.stringify(cache)); console.log(done, "looked up,", hit, "found"); }
  await new Promise((r) => setTimeout(r, 120));
}
writeFileSync(`${DIR}/venues.json`, JSON.stringify(cache));
console.log(`venues: ${venues.size}, newly looked up ${done}, found ${hit}`);

const GEO = `${DIR}/geocheck.json`, geo = existsSync(GEO) ? JSON.parse(readFileSync(GEO, "utf8")) : {};
let g = 0;
for (const i of venues.values()) {
  const q = `${i.venue}${i.city && !i.venue.includes(i.city) ? `, ${i.city}` : ""}`; // placeName() in the build
  if (q in geo) continue;
  try {
    const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: UA })).json();
    geo[q] = r[0] ? { lat: +r[0].lat, lng: +r[0].lon, name: r[0].display_name } : null;
  } catch { continue; }
  if (++g % 50 === 0) { writeFileSync(GEO, JSON.stringify(geo)); console.log(g, "geocoded"); }
  await new Promise((r) => setTimeout(r, 1100));
}
writeFileSync(GEO, JSON.stringify(geo));
console.log(`geocoded ${g} more venues`);

// Cities of venues neither source could place: the build falls back to the city pin (key "city|<city>"). Venues Cricsheet
// gives no city for come from content/cricsheet/venue-cities.json.
const VC = existsSync(`${DIR}/venue-cities.json`) ? JSON.parse(readFileSync(`${DIR}/venue-cities.json`, "utf8")) : {};
let c = 0;
for (const i of venues.values()) {
  const q = `${i.venue}${i.city && !i.venue.includes(i.city) ? `, ${i.city}` : ""}`;
  const city = i.city ?? VC[i.venue], key = `city|${city}`;
  if (!city || key in geo || (geo[q] && cache[`${i.venue}|${i.city ?? ""}`])) continue;
  try {
    const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`, { headers: UA })).json();
    geo[key] = r[0] ? { lat: +r[0].lat, lng: +r[0].lon, name: r[0].display_name } : null;
  } catch { continue; }
  if (++c % 50 === 0) { writeFileSync(GEO, JSON.stringify(geo)); console.log(c, "cities geocoded"); }
  await new Promise((r) => setTimeout(r, 1100));
}
writeFileSync(GEO, JSON.stringify(geo));
console.log(`geocoded ${c} venue cities`);
