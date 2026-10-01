// Builds the "Who's the Player?" content from the moments database: a player pool for the guess box, one puzzle per
// standout performance (five clues, all facts parsed from the Cricsheet-generated question text and story, nothing
// invented), and a dated schedule of three puzzles a day. Output: src/content/who.json (server-only: it holds answers).
//
// Usage: node --env-file=.env.neon scripts/who-build.mjs [startDate=today IST] [days=120]
//        node --env-file=.env.neon scripts/who-build.mjs --duel   → src/content/who-duel.json only (the 1v1 Name Race bank:
//        one puzzle per player with 2+ international moments at 2+ grounds; who.json and the daily schedule are untouched)
// Re-running with the same database and start date gives the same file (seeded shuffle), so the schedule is stable.
import { writeFileSync } from "node:fs";

const DUEL = process.argv[2] === "--duel";
const START = DUEL ? "" : process.argv[2] ?? new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const DAYS = Number(process.argv[3] ?? 120);
const PER_DAY = 3;
const GAP_DAYS = 21; // a player can't be the answer again within three weeks

async function rows() {
  // Moments still live as answers in the scored Daily and Test Match modes are left out, so this game never spoils them.
  const q = `select id, text, answer, when_text, story, lat, lng from questions where status in ('live','queued') and pool not in ('daily','edition')`;
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    return neon(process.env.DATABASE_URL).query(q);
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  const r = (await db.query(q)).rows; await db.close(); return r;
}

const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TEXT = /^Where did (.+?) (score|take) (\d+)( not out)?(?: for (\d+))? for (.+?) against (.+?) in a (\d{4}) (.+?)\?$/;
const INTL = /^(Test|ODI|T20I|women's (?:Test|ODI|T20I))$/;
const SHORT = { "Indian Premier League": "IPL", "Big Bash League": "BBL", "Women's Big Bash League": "WBBL", "Caribbean Premier League": "CPL", "Bangladesh Premier League": "BPL", "Pakistan Super League": "PSL", "Lanka Premier League": "LPL" };
const fmtLabel = (f) => SHORT[f] ?? f.replace(/^women's /, "Women's ");

function parse(r) {
  const m = r.text.match(TEXT);
  if (!m) return null;
  const [, name, verb, n, notOut, conceded, team, opp, year, format] = m;
  const s = r.story ?? "";
  const balls = Number(s.match(/ off (\d+) balls/)?.[1] ?? 0) || null;
  const month = r.when_text?.split(" ")[0] ?? "";
  const res = s.match(/\d{4}\. (.+?)\.?$/)?.[1] ?? "";
  let result = "";
  const won = res.match(/^(.+?) won by (.+)$/);
  if (won) result = won[1] === team ? `his side won by ${won[2]}` : won[1] === opp ? `his side lost by ${won[2]}` : "";
  else if (/drawn/i.test(res)) result = "match drawn";
  else if (/tied/i.test(res)) result = "match tied";
  return {
    qid: r.id, name, team, opp, year: Number(year), month, format, intl: INTL.test(format), women: /women/i.test(format),
    bat: verb === "score", runs: verb === "score" ? Number(n) : null, notOut: !!notOut, balls,
    wkts: verb === "take" ? Number(n) : null, conceded: conceded ? Number(conceded) : null,
    ground: r.answer, pt: [Math.round(r.lng * 1e4) / 1e4, Math.round(r.lat * 1e4) / 1e4], result, story: s,
  };
}

const perf = (m) => (m.bat ? `${m.runs}${m.notOut ? "*" : ""}` : `${m.wkts}/${m.conceded}`);
const impact = (m) => (m.bat ? m.runs : m.wkts * 22) + (m.intl ? 40 : 0) + (m.format === "Test" ? 10 : 0);
const initials = (name) => name.split(/\s+/).map((w) => w[0].toUpperCase() + ".").join("");
const his = (m, s) => (m.women ? s.replace(/\bhis\b/g, "her") : s);

function clues(a, trail, player) {
  return [
    { kind: "pin", text: `${a.ground} · ${a.month} ${a.year}`, pins: [a.pt] },
    { kind: "match", text: [`${fmtLabel(a.format)} v ${a.opp}`, his(a, a.result)].filter(Boolean).join(" · ") },
    { kind: "numbers", text: a.bat ? `${perf(a)} off ${a.balls ?? "?"} balls` : `${a.wkts} for ${a.conceded} in the innings` },
    { kind: "trail", text: trail.map((t) => `${t.ground.split(",")[0]}, ${t.year}: ${perf(t)} v ${t.opp}`).join("\n"), pins: [a.pt, ...trail.map((t) => t.pt)] },
    { kind: "initials", text: `${player.team}${player.women ? " women" : ""} · ${initials(player.name)}` },
  ];
}

// Seeded shuffle (mulberry32) so the same inputs always give the same schedule.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const moments = (await rows()).map(parse).filter(Boolean);
const byPlayer = new Map();
for (const m of moments) { const id = slug(m.name); (byPlayer.get(id) ?? byPlayer.set(id, []).get(id)).push(m); }

// Guess-box pool: everyone with an international moment, so the list never narrows to just today's answers.
const players = [];
const puzzles = {};
const leaks = [];
for (const [id, ms] of byPlayer) {
  const intl = ms.filter((m) => m.intl);
  if (!intl.length) continue;
  const teams = intl.reduce((c, m) => c.set(m.team, (c.get(m.team) ?? 0) + 1), new Map());
  const team = [...teams].sort((a, b) => b[1] - a[1])[0][0];
  const p = { id, name: ms[0].name, team, women: intl[0].women, fame: intl.length };
  players.push({ id, name: p.name, team: `${team}${p.women ? " women" : ""}` });
  const grounds = new Set(intl.map((m) => m.ground));
  const need = DUEL ? 2 : 3; // the duel bank takes a shorter career trail to cover more players
  if (intl.length < need || grounds.size < need) continue; // needs a real career trail
  const ranked = [...ms].sort((a, b) => impact(b) - impact(a));
  const anchors = ranked.filter((m) => m.intl).slice(0, DUEL ? 1 : Math.min(4, Math.ceil(intl.length / 3)));
  anchors.forEach((a, k) => {
    const pool = ms.filter((m) => m !== a && m.ground !== a.ground).sort((x, y) => x.year - y.year);
    const trail = [];
    for (const m of [pool[0], pool.at(-1), ...[...pool].sort((x, y) => impact(y) - impact(x))]) {
      if (m && !trail.includes(m) && !trail.some((t) => t.ground === m.ground) && trail.length < 3) trail.push(m);
    }
    if (trail.length < (DUEL ? 1 : 2)) return;
    const c = clues(a, trail.sort((x, y) => x.year - y.year), p);
    // QA: no part of the name may appear before the initials clue.
    const tokens = p.name.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    const leak = c.slice(0, 4).find((cl) => tokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(cl.text)));
    if (leak) { leaks.push(`${p.name}: ${leak.text}`); return; }
    if (c.some((cl) => !cl.text || /undefined|NaN/.test(cl.text))) return;
    puzzles[`${id}-${k + 1}`] = { player: id, fame: p.fame, anchor: a.qid, story: a.story, clues: c };
  });
}

if (DUEL) {
  writeFileSync("src/content/who-duel.json", JSON.stringify({ puzzles }));
  const known = new Set(players.map((p) => p.id));
  console.log(`duel bank: ${Object.keys(puzzles).length} puzzles · all answers in the guess pool: ${Object.values(puzzles).every((p) => known.has(p.player))} · leaks dropped: ${leaks.length}`);
  process.exit(0);
}

// Schedule: a star first (most-documented players), then a well-known name, then a deeper cut; no player twice within
// GAP_DAYS. Fame = number of international moments we hold for the player, a decent proxy for how well fans know them.
const rand = rng(20261001);
const shuffled = (xs) => xs.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const tier = (lo, hi) => shuffled(Object.keys(puzzles).filter((k) => puzzles[k].fame >= lo && puzzles[k].fame < hi));
const famous = tier(8, 1e9), known = tier(5, 8), rest = tier(0, 5);
const lastSeen = new Map();
const days = {};
for (let d = 0; d < DAYS; d++) {
  const date = addDays(START, d), pick = [];
  const take = (list) => {
    const i = list.findIndex((k) => !pick.some((p) => puzzles[p].player === puzzles[k].player) && d - (lastSeen.get(puzzles[k].player) ?? -1e9) >= GAP_DAYS);
    if (i < 0) return false;
    const [k] = list.splice(i, 1); pick.push(k); lastSeen.set(puzzles[k].player, d); return true;
  };
  for (const order of [[famous, known, rest], [known, famous, rest], [rest, known, famous]]) order.some(take);
  if (pick.length < PER_DAY) break;
  days[date] = pick;
}

players.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync("src/content/who.json", JSON.stringify({ start: START, players, puzzles, days }));
console.log(`players in pool: ${players.length} · puzzles: ${Object.keys(puzzles).length} · days scheduled: ${Object.keys(days).length} (${START} → ${Object.keys(days).at(-1)})`);
if (leaks.length) console.log(`dropped for name leaks (${leaks.length}):`, leaks.slice(0, 5));
const first = days[START] ?? [];
console.log("day 1:", first.map((k) => `${puzzles[k].player} ⇒ ${puzzles[k].clues.map((c) => c.text.replace(/\n/g, " | ")).join(" ‖ ")}`).join("\n       "));
