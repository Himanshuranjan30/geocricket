// End-to-end check of question answers. Input: a JSON dump of the questions table (array of rows). For Cricsheet
// questions it goes back to the source match file; for all it checks duplicates and geocodes each answer independently
// with OpenStreetMap Nominatim (cached in content/cricsheet/geocheck.json, 1 request/s per their policy).
// Output: <dump>.audit.json with one entry per flagged question. Usage: node scripts/verify-questions.mjs <dump.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stageName } from "./cricsheet-stage.mjs";

const dump = process.argv[2];
const rows = JSON.parse(readFileSync(dump, "utf8"));
const DIR = "content/cricsheet", CACHE = `${DIR}/geocheck.json`, UA = { "User-Agent": "GeoCricket/1.0 (answer check; https://geocricket.app)" };
const geo = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const flags = [];
const flag = (r, kind, detail) => flags.push({ id: r.id, pool: r.pool, status: r.status, kind, detail, text: r.text, answer: r.answer });

const km = (a, b) => { const R = 6371, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const STOP = new Set(["the", "stadium", "ground", "cricket", "international", "oval", "park", "club", "and", "of", "de", "at", "sports", "association"]);
const toks = (s) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)));

// 1. Same question text with different answers (or twice at all) — one of them is wrong for the player.
const byText = new Map();
for (const r of rows) { const k = r.text.toLowerCase().replace(/\s+/g, " ").trim(); byText.set(k, [...(byText.get(k) ?? []), r]); }
for (const group of byText.values()) if (group.length > 1) for (const r of group) flag(r, "duplicate-text", `${group.length} questions share this text; answers: ${[...new Set(group.map((g) => g.answer))].join(" / ")}`);

// 2. Cricsheet: re-read the match and check the claim's shape against it.
const venueOf = new Map();
for (const r of rows) {
  const m = /^cs-(\d+)-(bat|bowl|ten|final|hat|total|collapse|tie|superover|onewkt|tight|upset)/.exec(r.id); if (!m) continue;
  const file = `${DIR}/json/${m[1]}.json`;
  if (!existsSync(file)) { flag(r, "no-source", file); continue; }
  const info = JSON.parse(readFileSync(file, "utf8")).info;
  venueOf.set(r.id, `${info.venue}${info.city && !info.venue.includes(info.city) ? `, ${info.city}` : ""}`);
  if (m[2] === "final") { // the question must name the real knockout stage
    const stage = stageName(info.event?.stage);
    if (!stage || !new RegExp(` ${stage}( at this ground\\.|\\?)$`).test(r.text)) flag(r, "wrong-stage", `stage is "${info.event?.stage ?? "?"}"`);
  }
  // The matched ground should share words with Cricsheet's own venue name.
  const v = toks(info.venue.split(",")[0]), a = toks(r.answer.split(",")[0]);
  const overlap = [...v].filter((t) => a.has(t)).length / Math.max(1, Math.min(v.size, a.size));
  if (overlap < 0.5) flag(r, "venue-name-mismatch", `Cricsheet venue "${info.venue}" (${info.city ?? "no city"}) vs answer "${r.answer}"`);
  if (info.city && !r.answer.toLowerCase().includes(info.city.toLowerCase().split(" ")[0]) && !info.venue.toLowerCase().includes(r.answer.split(",")[0].toLowerCase())) {
    // city missing from the answer is fine only when the venue name itself matched
    if (overlap < 1) flag(r, "city-mismatch", `Cricsheet city "${info.city}" not in answer "${r.answer}"`);
  }
}

// 3. Independent geocode of each distinct place; far from the stored pin = wrong coordinates.
const places = new Map();
for (const r of rows) { const q = venueOf.get(r.id) ?? r.answer; places.set(q, [...(places.get(q) ?? []), r]); }
let n = 0;
for (const [q, rs] of places) {
  if (!(q in geo)) {
    try {
      const res = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: UA })).json();
      geo[q] = res[0] ? { lat: +res[0].lat, lng: +res[0].lon, name: res[0].display_name } : null;
    } catch { continue; }
    if (++n % 25 === 0) { writeFileSync(CACHE, JSON.stringify(geo)); console.log(n, "geocoded"); }
    await new Promise((r) => setTimeout(r, 1100));
  }
  const g = geo[q]; if (!g) { for (const r of rs) flag(r, "geocode-miss", q); continue; }
  for (const r of rs) { const d = km(g, r); if (d > 25) flag(r, "pin-far-from-venue", `${Math.round(d)} km from OSM "${g.name}" (query "${q}")`); }
}
writeFileSync(CACHE, JSON.stringify(geo));
writeFileSync(dump.replace(/\.json$/, ".audit.json"), JSON.stringify(flags, null, 1));
const count = {}; for (const f of flags) count[f.kind] = (count[f.kind] ?? 0) + 1;
console.log(`${rows.length} questions, ${new Set(flags.map((f) => f.id)).size} flagged:`, count);
