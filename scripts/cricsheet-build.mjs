// Builds GeoCricket questions from Cricsheet match data (https://cricsheet.org, ODC-BY). Facts come only from the data:
// standout innings, bowling hauls, hat-tricks, record and collapse totals, ties/super overs/one-wicket finishes, associate
// upsets and tournament knockouts, across internationals (full members, associates, women) and domestic cricket worldwide,
// each placed at its venue via cross-checked coordinates.
// Input: content/cricsheet/json/*.json, names.csv, grounds.json. Output: content/cricsheet/candidates.json
// Usage: node scripts/cricsheet-build.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { stageName } from "./cricsheet-stage.mjs";

const DIR = "content/cricsheet";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Full (Test-playing) ICC members and when they joined, so an "upset" is judged by status at the time.
const FULL_SINCE = { India: "1926", Australia: "1909", England: "1909", "South Africa": "1909", "New Zealand": "1926", Pakistan: "1952", "Sri Lanka": "1981-07", "West Indies": "1926", Zimbabwe: "1992-07", Bangladesh: "2000-06", Afghanistan: "2017-06-22", Ireland: "2017-06-22" };
const fullAt = (team, date) => !!FULL_SINCE[team] && date >= FULL_SINCE[team];
const BIG_EVENT = /World Cup|World Twenty20|Champions Trophy|Asia Cup|Ashes|World Test Championship/i;

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
const VENUE_CITY = existsSync(`${DIR}/venue-cities.json`) ? JSON.parse(readFileSync(`${DIR}/venue-cities.json`, "utf8")) : {};
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
  // Last resort for small grounds no source knows (associate venues): the city itself, when OSM can place it. A city
  // pin is a few km from the ground, well inside a question's 500 km scale.
  const town = !pin && (city ?? VENUE_CITY[venue]) ? osm[`city|${city ?? VENUE_CITY[venue]}`] : null;
  const hit = (pin ?? town) && { name: placeName(venue, city), lat: (pin ?? town).lat, lng: (pin ?? town).lng };
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
const s1 = (n, w) => `${n} ${n === 1 ? w : `${w}s`}`;
const margin = (o) => { const [k, n] = Object.entries(o.by ?? {})[0] ?? []; return k === "innings" ? `an innings${o.by.runs ? ` and ${s1(o.by.runs, "run")}` : ""}` : k ? s1(n, k.replace(/s$/, "")) : null; };
for (const f of files) {
  let m; try { m = JSON.parse(readFileSync(`${DIR}/json/${f}`, "utf8")); } catch { continue; }
  const info = m.info; if (!info?.venue || !info.dates?.[0] || !info.teams?.length) continue;
  const type = info.match_type; const intl = info.team_type === "international"; const ev = eventName(info);
  if (!intl && !ev) continue; // domestic only within a named competition
  const g = locate(info.venue, info.city);
  if (!g) { unplaced.set(info.venue, (unplaced.get(info.venue) ?? 0) + 1); continue; }
  const id = f.replace(".json", ""); const date = info.dates[0]; const year = date.slice(0, 4);
  const reg = info.registry?.people ?? {};
  const nm = (short) => fullName.get(reg[short]) ?? short;
  const women = info.gender === "female";
  const fmt = type === "Test" || type === "MDM" ? "Test" : type === "ODI" || type === "ODM" ? "ODI" : "T20";
  const FULL = { has: (t) => fullAt(t, date) };
  const assoc = intl && info.teams.some((t) => !FULL.has(t)); // at least one associate side
  // Official formats only get their official names; Cricsheet's ODM/MDM/IT20 are other internationals.
  const official = { Test: "Test", ODI: "ODI", T20: "T20I", ODM: "one-day international match", MDM: "multi-day international match", IT20: "T20 international match" }[type] ?? "international match";
  const label = intl ? `${women ? "women's " : ""}${official}` : ev;
  // "in a 2019 ODI" / "at the 2019 ICC Cricket World Cup" / "in a 2023 County Championship match"
  const ctx = intl && BIG_EVENT.test(ev) ? `at the ${/\d{4}/.test(ev) ? "" : `${year} `}${ev}` : intl ? `in a ${year} ${label}` : `in the ${/\d{4}/.test(ev) ? ev : `${year} ${ev}`}`;
  const place = g.name; const o = info.outcome ?? {}; const res = result(info);
  const tier = intl ? (women ? 0.2 : 0.5) + (assoc ? -0.1 : 0.3) : 0; // ranking only
  const base = { answer: place, when: when(date), lat: g.lat, lng: g.lng, scaleKm: 500, source: `https://cricsheet.org (match ${id})`, region: info.teams.includes("India") ? "india" : "global" };
  const push = (kind, key, score, text, story, player, who) => out.push({ ...base, id: `cs-${id}-${kind}${key ? `-${key}` : ""}`, match: id, player, who, score: score + tier, text, story: `${story}${res ? ` ${res}.` : ""}` });

  const matchWkts = new Map();
  for (const inn of m.innings ?? []) {
    if (inn.super_over) continue;
    const bat = new Map(), bowl = new Map(), seq = new Map(); let total = 0, wkts = 0;
    for (const over of inn.overs ?? []) for (const d of over.deliveries ?? []) {
      total += d.runs?.total ?? 0;
      const b = bat.get(d.batter) ?? { runs: 0, balls: 0, out: false };
      b.runs += d.runs?.batter ?? 0; if (!d.extras?.wides) b.balls++; bat.set(d.batter, b);
      const w = bowl.get(d.bowler) ?? { w: 0, r: 0 };
      w.r += (d.runs?.batter ?? 0) + (d.extras?.wides ?? 0) + (d.extras?.noballs ?? 0);
      let credited = false;
      for (const x of d.wickets ?? []) {
        wkts++; const ob = bat.get(x.player_out); if (ob) ob.out = true;
        if (!["run out", "retired hurt", "retired out", "retired not out", "obstructing the field"].includes(x.kind)) { credited = true; w.w++; matchWkts.set(d.bowler, (matchWkts.get(d.bowler) ?? 0) + 1); }
      }
      bowl.set(d.bowler, w);
      if (!d.extras?.wides && !d.extras?.noballs) seq.set(d.bowler, [...(seq.get(d.bowler) ?? []), credited]); // bowler's legal balls
    }
    const team = inn.team, opp = info.teams.find((t) => t !== team) ?? "";
    // International hundreds (T20: big fifties) and big domestic innings.
    const minBat = intl ? (fmt === "Test" ? (women ? 75 : 100) : fmt === "ODI" ? (women ? 90 : 100) : women ? 60 : 70) : fmt === "Test" ? 150 : fmt === "ODI" ? 125 : 85;
    for (const [p, b] of bat) if (b.runs >= minBat) {
      const who = nm(p), sc = `${b.runs}${b.out ? "" : " not out"}`;
      // Innings, spells, ten-fors and finals keep the "Where did …?" shape: Mystery Cricketer (who-build), player hubs (seo.ts)
      // and moment titles parse it.
      push("bat", slug(p), b.runs / minBat, `Where did ${who} score ${sc} for ${team} against ${opp} in a ${year} ${label}?`, `${who} made ${sc} off ${b.balls} balls for ${team} against ${opp} at ${place} in ${when(date)}.`, reg[p] ?? p, who);
    }
    const minW = intl ? (fmt === "Test" ? 5 : fmt === "ODI" ? 5 : 4) : fmt === "Test" ? 6 : fmt === "ODI" ? 5 : 4;
    for (const [p, w] of bowl) if (w.w >= minW) {
      const who = nm(p);
      push("bowl", `${slug(p)}-${slug(team)}`, w.w / minW + 0.1, `Where did ${who} take ${w.w} for ${w.r} for ${opp} against ${team} in a ${year} ${label}?`, `${who} returned figures of ${w.w}/${w.r} for ${opp} against ${team} at ${place} in ${when(date)}.`, reg[p] ?? p, who);
    }
    for (const [p, balls] of seq) if (balls.some((x, i) => x && balls[i + 1] && balls[i + 2])) {
      const who = nm(p);
      push("hat", slug(p), 1.5, `${who} took a hat-trick for ${opp} against ${team} ${ctx} at this ground.`,
        `${who} took three wickets in three balls for ${opp} against ${team} at ${place} in ${when(date)}.`, reg[p] ?? p, who);
    }
    // Team totals: records and collapses (completed innings only for collapses).
    const allOut = wkts >= 10;
    const hi = intl ? (fmt === "Test" ? 600 : fmt === "ODI" ? 375 : assoc ? 250 : 230) : fmt === "Test" ? 700 : fmt === "ODI" ? 400 : 250;
    const lo = intl ? (fmt === "Test" ? 60 : fmt === "ODI" ? 60 : 45) : fmt === "Test" ? 40 : fmt === "ODI" ? 50 : 40;
    if (total >= hi) push("total", slug(team), 1 + (total - hi) / hi, `${team} piled up ${total}${allOut ? "" : `/${wkts}`} against ${opp} ${ctx} at this ground.`,
      `${team} made ${total}${allOut ? " all out" : `/${wkts}`} against ${opp} at ${place} in ${when(date)}.`);
    if (allOut && total <= lo) push("collapse", slug(team), 1.2, `${team} were bowled out for just ${total} by ${opp} ${ctx} at this ground.`,
      `${team} were all out for ${total} against ${opp} at ${place} in ${when(date)}.`);
  }
  if (fmt === "Test" && intl) for (const [p, n] of matchWkts) if (n >= 10) {
    const who = nm(p); const team = info.teams.find((t) => (info.players?.[t] ?? []).includes(p)) ?? "";
    push("ten", slug(p), n / 10 + 0.4, `Where did ${who} take ${n} wickets in a ${year} ${label}${team ? ` for ${team}` : ""}?`,
      `${who} took ${n} wickets in the match at ${place} in ${when(date)}.`, reg[p] ?? p, who);
  }
  // Results worth remembering: ties, Super Overs, one-wicket and one-or-two-run finishes, associate upsets.
  const [a, b2] = info.teams; const loser = o.winner && info.teams.find((t) => t !== o.winner);
  const notable = intl || stageName(info.event?.stage);
  if (notable) {
    if (o.result === "tie" && !o.eliminator) push("tie", "", 1.5, `${a} and ${b2} played out a tie ${ctx} at this ground.`, `${a} and ${b2} tied at ${place} in ${when(date)}.`);
    if (o.eliminator) push("superover", "", 1.5, `${o.eliminator} beat ${info.teams.find((t) => t !== o.eliminator)} in a Super Over ${ctx} at this ground.`, `${o.eliminator} won a Super Over against ${info.teams.find((t) => t !== o.eliminator)} at ${place} in ${when(date)}.`);
    if (o.winner && o.by?.wickets === 1) push("onewkt", "", 1.3, `${o.winner} beat ${loser} by one wicket ${ctx} at this ground.`, `${o.winner} won by one wicket against ${loser} at ${place} in ${when(date)}.`);
    if (o.winner && o.by?.runs && o.by.runs <= 2 && !o.by.innings) push("tight", "", 1.3, `${o.winner} beat ${loser} by just ${s1(o.by.runs, "run")} ${ctx} at this ground.`, `${o.winner} won by ${s1(o.by.runs, "run")} against ${loser} at ${place} in ${when(date)}.`);
  }
  if (intl && o.winner && !FULL.has(o.winner) && FULL.has(loser) && margin(o)) push("upset", "", 1.6, `${o.winner} stunned ${loser} by ${margin(o)} ${ctx} at this ground.`, `${o.winner} beat ${loser} by ${margin(o)} at ${place} in ${when(date)}.`);
  const stage = stageName(info.event?.stage);
  if (stage && o.winner) push("final", "", stage === "final" ? 1.6 : stage === "semi-final" ? 1.3 : 1.1,
    `Where did ${o.winner} win the ${year} ${ev} ${stage}?`,
    `${o.winner} won the ${year} ${ev} ${stage} at ${place}.`);
}

// One question per id; strongest first. Drop ones where Cricsheet only knows the player by initials ("N Ali").
const named = (q) => !q.who || !/^[A-Z]{1,3} [A-Z]/.test(q.who);
const byId = new Map(); // one question per id, the strongest (a Test bowler's two spells against the same side share an id)
for (const q of out.filter(named)) if (!byId.has(q.id) || q.score > byId.get(q.id).score) byId.set(q.id, q);
// Two questions with the same text (e.g. a best-of-three finals series) can't both have one right answer: drop them.
const texts = new Map(); for (const q of byId.values()) texts.set(q.text, (texts.get(q.text) ?? 0) + 1);
// Variety: at most 10 questions per player and 3 per match, strongest kept.
const perPlayer = new Map(), perMatch = new Map();
const all = [...byId.values()].filter((q) => texts.get(q.text) === 1).sort((a, b) => b.score - a.score).filter((q) => {
  if (q.player && (perPlayer.get(q.player) ?? 0) >= 10) return false;
  if ((perMatch.get(q.match) ?? 0) >= 3) return false;
  if (q.player) perPlayer.set(q.player, (perPlayer.get(q.player) ?? 0) + 1);
  perMatch.set(q.match, (perMatch.get(q.match) ?? 0) + 1); return true;
}).map(({ match, player, who, ...q }) => q);
writeFileSync(`${DIR}/candidates.json`, JSON.stringify(all));
const kinds = {}; for (const q of all) { const k = q.id.split("-")[2]; kinds[k] = (kinds[k] ?? 0) + 1; }
console.log(`${files.length} matches → ${all.length} questions`, kinds);
console.log(`Unplaced venues: ${unplaced.size} (${[...unplaced.values()].reduce((x, y) => x + y, 0)} matches)`);
console.log("Top unplaced:", [...unplaced.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([v, n]) => `${v} (${n})`).join("; "));
