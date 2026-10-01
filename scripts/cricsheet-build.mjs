// Builds GeoCricket questions from Cricsheet match data (https://cricsheet.org, ODC-BY). Facts come only from the data:
// standout innings, bowling hauls and tournament finals, each placed at its venue via Wikidata ground coordinates.
// Input: content/cricsheet/json/*.json, names.csv, grounds.json. Output: content/cricsheet/candidates.json
// Usage: node scripts/cricsheet-build.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { stageName } from "./cricsheet-stage.mjs";

const DIR = "content/cricsheet";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LEAGUES = /Indian Premier League|Big Bash|Pakistan Super League|Caribbean Premier|SA20|The Hundred|Women's Premier League|Bangladesh Premier/i;

// Full names: the longest multi-word variant Cricsheet knows for each person.
const fullName = new Map();
for (const line of readFileSync(`${DIR}/names.csv`, "utf8").split("\n").slice(1)) {
  const [id, ...rest] = line.split(",");
  const name = rest.join(",").replace(/^"|"$/g, "").trim();
  if (!id || !name) continue;
  const cur = fullName.get(id);
  if (!cur || name.split(" ").length > cur.split(" ").length || (name.split(" ").length === cur.split(" ").length && name.length > cur.length)) fullName.set(id, name);
}

// Venue → coordinates: token overlap between Cricsheet's venue name and Wikidata ground names/aliases.
const STOP = new Set(["the", "stadium", "ground", "cricket", "international", "oval", "park", "club", "and", "of", "de", "at"]);
const toks = (s) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)));
const grounds = JSON.parse(readFileSync(`${DIR}/grounds.json`, "utf8")).map((g) => ({ ...g, keys: [g.name, ...g.aliases].map(toks) }));
const venueCache = new Map();
const wikiVenues = existsSync(`${DIR}/venues.json`) ? JSON.parse(readFileSync(`${DIR}/venues.json`, "utf8")) : {};
const osm = existsSync(`${DIR}/geocheck.json`) ? JSON.parse(readFileSync(`${DIR}/geocheck.json`, "utf8")) : {}; // scripts/verify-questions.mjs
const km = (a, b) => { const t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2)); };
const near = (a, b) => !!a && !!b && km(a, b) < 25;
const placeName = (venue, city) => `${venue}${city && !venue.includes(city) ? `, ${city}` : ""}`;
// Venue → coordinates from three independent sources: a Wikidata ground (token match on the name), the Wikipedia
// article for the venue (scripts/cricsheet-venues.mjs) and an OpenStreetMap geocode. A pin needs two of them to agree
// within 25 km; a lone Wikipedia/OSM hit is accepted, a lone name match isn't (that's how "Melbourne Cricket Ground"
// once matched a Melbourne Park 15,000 km away). The answer shown is always Cricsheet's own venue name.
function locate(venue, city) {
  const key = `${venue}|${city ?? ""}`; // same key as scripts/cricsheet-venues.mjs
  if (venueCache.has(key)) return venueCache.get(key);
  const v = toks(venue.split(",")[0]);
  let best = null, bestScore = 0;
  for (const g of grounds) for (const k of g.keys) {
    if (!k.size || !v.size) continue;
    const inter = [...v].filter((t) => k.has(t)).length;
    let score = inter / Math.max(v.size, k.size);
    if (city && g.city && toks(g.city).has([...toks(city)][0])) score += 0.15;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  const wd = bestScore >= 0.6 ? best : null, wiki = wikiVenues[key] ?? null, geo = osm[placeName(venue, city)] ?? null;
  // A single venue-specific hit is enough when it names the city and shares a word with the venue ("National Stadium
  // Karachi, … Karachi" for "National Stadium, Karachi").
  const names = (x) => !!x && [...v].some((t) => toks(x.name).has(t)) && (!city || x.name.toLowerCase().includes(city.toLowerCase()));
  const pin = near(wd, wiki) || near(wd, geo) ? wd : near(wiki, geo) ? wiki : !wd && (wiki || geo) && !(wiki && geo) ? wiki ?? geo
    : names(geo) ? geo : names(wiki) ? wiki : null;
  const hit = pin && { name: placeName(venue, city), lat: pin.lat, lng: pin.lng };
  venueCache.set(key, hit);
  return hit;
}

const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const when = (d) => { const [y, m] = d.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };
const eventName = (info) => info.event?.name ?? "";
const result = (info) => {
  const o = info.outcome ?? {};
  if (o.winner && o.by) { const [k, n] = Object.entries(o.by)[0]; return k === "innings" ? `${o.winner} won by an innings${o.by.runs ? ` and ${o.by.runs} runs` : ""}` : `${o.winner} won by ${n} ${n === 1 ? k.replace(/s$/, "") : k}`; }
  if (o.result === "draw") return "The match was drawn";
  if (o.result === "tie") return "The match was tied";
  return o.winner ? `${o.winner} won` : null;
};

const out = [];
const unplaced = new Map();
const files = readdirSync(`${DIR}/json`).filter((f) => f.endsWith(".json"));
for (const f of files) {
  let m; try { m = JSON.parse(readFileSync(`${DIR}/json/${f}`, "utf8")); } catch { continue; }
  const info = m.info; if (!info?.venue || !info.dates?.[0]) continue;
  const type = info.match_type; const intl = info.team_type === "international"; const ev = eventName(info);
  if (!intl && !LEAGUES.test(ev)) continue; // internationals + major leagues only
  const g = locate(info.venue, info.city);
  if (!g) { unplaced.set(info.venue, (unplaced.get(info.venue) ?? 0) + 1); continue; }
  const id = f.replace(".json", ""); const date = info.dates[0]; const year = date.slice(0, 4);
  const reg = info.registry?.people ?? {};
  const nm = (short) => fullName.get(reg[short]) ?? short;
  const women = info.gender === "female";
  const fmt = type === "Test" || type === "MDM" ? "Test" : type === "ODI" || type === "ODM" ? "ODI" : "T20";
  const label = intl ? `${women ? "women's " : ""}${fmt === "Test" ? "Test" : fmt === "ODI" ? "ODI" : "T20I"}` : ev;
  const place = g.name;
  const res = result(info);
  const base = { answer: place, when: when(date), lat: g.lat, lng: g.lng, scaleKm: 500, source: `https://cricsheet.org (match ${id})`, region: info.teams.includes("India") ? "india" : "global" };

  const matchWkts = new Map();
  for (const inn of m.innings ?? []) {
    const bat = new Map(), bowl = new Map();
    for (const over of inn.overs ?? []) for (const d of over.deliveries ?? []) {
      const b = bat.get(d.batter) ?? { runs: 0, balls: 0, out: false };
      b.runs += d.runs?.batter ?? 0; if (!d.extras?.wides) b.balls++; bat.set(d.batter, b);
      const w = bowl.get(d.bowler) ?? { w: 0, r: 0 };
      w.r += (d.runs?.batter ?? 0) + (d.extras?.wides ?? 0) + (d.extras?.noballs ?? 0);
      for (const x of d.wickets ?? []) {
        const ob = bat.get(x.player_out); if (ob) ob.out = true;
        if (!["run out", "retired hurt", "retired out", "obstructing the field"].includes(x.kind)) { w.w++; matchWkts.set(d.bowler, (matchWkts.get(d.bowler) ?? 0) + 1); }
      }
      bowl.set(d.bowler, w);
    }
    const opp = info.teams.find((t) => t !== inn.team) ?? "";
    const bowlTeam = opp;
    const minBat = fmt === "Test" ? 150 : fmt === "ODI" ? 130 : 100;
    for (const [p, b] of bat) if (b.runs >= minBat) {
      const who = nm(p); const s = `${b.runs}`;
      out.push({ ...base, id: `cs-${id}-bat-${slug(p)}`, score: b.runs / minBat + (intl ? 0.3 : 0),
        text: `Where did ${who} score ${s}${b.out ? "" : " not out"} for ${inn.team} against ${opp} in a ${year} ${label}?`,
        story: `${who} made ${b.runs}${b.out ? "" : " not out"} off ${b.balls} balls against ${opp} at ${place} in ${when(date)}.${res ? ` ${res}.` : ""}` });
    }
    const minW = fmt === "Test" ? 7 : fmt === "ODI" ? 6 : 5;
    for (const [p, w] of bowl) if (w.w >= minW) {
      const who = nm(p);
      out.push({ ...base, id: `cs-${id}-bowl-${slug(p)}-${slug(inn.team)}`, score: w.w / minW + 0.1 + (intl ? 0.3 : 0),
        text: `Where did ${who} take ${w.w} for ${w.r} for ${bowlTeam} against ${inn.team} in a ${year} ${label}?`,
        story: `${who} returned figures of ${w.w}/${w.r} against ${inn.team} at ${place} in ${when(date)}.${res ? ` ${res}.` : ""}` });
    }
  }
  if (fmt === "Test") for (const [p, n] of matchWkts) if (n >= 10) {
    const who = nm(p); const team = info.teams.find((t) => (info.players?.[t] ?? []).includes(p)) ?? "";
    out.push({ ...base, id: `cs-${id}-ten-${slug(p)}`, score: n / 10 + 0.4,
      text: `Where did ${who} take ${n} wickets in a ${year} ${label}${team ? ` for ${team}` : ""}?`,
      story: `${who} took ${n} wickets in the match at ${place} in ${when(date)}.${res ? ` ${res}.` : ""}` });
  }
  const stage = stageName(info.event?.stage);
  if (stage && info.outcome?.winner) out.push({ ...base, id: `cs-${id}-final`, score: stage === "final" ? 1.6 : stage === "semi-final" ? 1.3 : 1.1,
    text: `Where did ${info.outcome.winner} win the ${year} ${ev} ${stage}?`,
    story: `${info.outcome.winner} won the ${year} ${ev} ${stage} at ${place}.${res ? ` ${res}.` : ""}` });
}

// One question per id; strongest first. Drop ones where Cricsheet only knows the player by initials ("N Ali").
const named = (q) => { const m = q.text.match(/^Where did (\S+)/); return !m || m[1].length > 2 || !/^[A-Z]{1,2}$/.test(m[1]); };
const byId = new Map(out.filter(named).map((q) => [q.id, q]));
// Two questions with the same text (e.g. a best-of-three finals series) can't both have one right answer: drop them.
const texts = new Map(); for (const q of byId.values()) texts.set(q.text, (texts.get(q.text) ?? 0) + 1);
const all = [...byId.values()].filter((q) => texts.get(q.text) === 1).sort((a, b) => b.score - a.score);
writeFileSync(`${DIR}/candidates.json`, JSON.stringify(all));
console.log(`${files.length} matches → ${all.length} questions. Unplaced venues: ${unplaced.size} (${[...unplaced.values()].reduce((a, b) => a + b, 0)} matches)`);
console.log("Top unplaced:", [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([v, n]) => `${v} (${n})`).join("; "));
