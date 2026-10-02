// Creates a Mystery Cricketer creator challenge (/mystery/c/<slug>) from players the creator picked.
//
//   node --env-file=.env.neon scripts/challenge.mjs --slug sourabh --host xzx_slipknot --title "Sourabh's RCB Picks" --players "kohli,de villiers,gayle"
//   node --env-file=.env.neon scripts/challenge.mjs --suggest "India"          # list puzzle players for a team / name
//
// Players are matched by id or name. A challenge never reuses a moment that's still to come in the daily (that would
// spoil it): each player gets one of their other moments, and a player whose every moment is scheduled is refused. Prints the public link and the host's private link (?host=<key>) to send them.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const daily = JSON.parse(readFileSync("src/content/who.json", "utf8"));
const bank = JSON.parse(readFileSync("src/content/who-duel.json", "utf8")).puzzles;
const people = new Map(daily.players.map((p) => [p.id, p]));
// Every usable puzzle, keyed the way lib/who.ts resolves them: daily keys as-is, 1v1 bank keys prefixed "d:".
const ALL = { ...daily.puzzles, ...Object.fromEntries(Object.entries(bank).map(([k, v]) => [`d:${k}`, v])) };
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const ahead = new Set(Object.entries(daily.days).filter(([d]) => d >= today).flatMap(([, ks]) => ks.map((k) => daily.puzzles[k].anchor)));
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").trim();
// One puzzle per player, from a moment the daily won't show later: prefer the 1v1 bank's (the player's biggest moment).
const byPlayer = new Map(), scheduled = new Set();
for (const [k, p] of Object.entries(ALL)) {
  if (ahead.has(p.anchor)) { scheduled.add(p.player); continue; }
  if (!byPlayer.has(p.player) || k.startsWith("d:")) byPlayer.set(p.player, k);
}
const blocked = new Set([...scheduled].filter((id) => !byPlayer.has(id))); // every moment we hold for them is still to come
const open = (id) => byPlayer.has(id);

const suggest = arg("suggest");
if (suggest) {
  const q = norm(suggest);
  const hits = [...new Set([...byPlayer.keys(), ...blocked])].map((id) => people.get(id)).filter((p) => p && (norm(p.team).includes(q) || norm(p.name).includes(q)));
  for (const p of hits.sort((a, b) => (ALL[byPlayer.get(b.id)]?.fame ?? 0) - (ALL[byPlayer.get(a.id)]?.fame ?? 0)))
    console.log(`${open(p.id) ? "  " : "✗ "}${p.id.padEnd(28)} ${p.name} (${p.team})${blocked.has(p.id) ? "  (all their moments are coming up in the daily)" : ""}`);
  process.exit(0);
}

const slug = arg("slug"), host = arg("host")?.replace(/^@/, ""), title = arg("title"), picks = (arg("players") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!slug || !/^[a-z0-9-]{2,30}$/.test(slug) || !host || !title || picks.length < 3 || picks.length > 5) {
  console.log("Need --slug (a-z0-9-), --host <x handle>, --title, and 3–5 --players. Use --suggest <team|name> to browse.");
  process.exit(1);
}
const known = (p) => byPlayer.has(p.id) || blocked.has(p.id);
const find = (q) => people.get(q) ?? [...people.values()].find((p) => norm(p.name) === norm(q)) ?? [...people.values()].find((p) => known(p) && norm(p.name).split(" ").at(-1) === norm(q).split(" ").at(-1));
const keys = [], problems = [];
for (const q of picks) {
  const p = find(q);
  if (p && blocked.has(p.id)) problems.push(`"${q}" (${p.name}): every moment we hold is coming up in the daily, pick someone else`);
  else if (!p || !byPlayer.has(p.id)) problems.push(`"${q}": no puzzle for this player (try --suggest)`);
  else if (keys.some((k) => ALL[k].player === p.id)) problems.push(`"${q}" is listed twice`);
  else keys.push(byPlayer.get(p.id));
}
if (problems.length) { console.log("Can't create it:\n  " + problems.join("\n  ")); process.exit(1); }

const row = { slug, title, host_handle: host, puzzles: JSON.stringify(keys), host_key: randomBytes(9).toString("base64url"), created_ms: Date.now() };
const q = "insert into who_challenges (slug, title, host_handle, puzzles, host_key, created_ms) values ($1, $2, $3, $4::jsonb, $5, $6)";
const vals = [row.slug, row.title, row.host_handle, row.puzzles, row.host_key, row.created_ms];
try {
  if (process.env.DATABASE_URL) { const { neon } = await import("@neondatabase/serverless"); await neon(process.env.DATABASE_URL).query(q, vals); }
  else { const { PGlite } = await import("@electric-sql/pglite"); const db = new PGlite(process.env.PGLITE_DIR ?? ".pglite"); await db.query(q, vals); await db.close(); }
} catch (e) {
  console.log(/duplicate key|unique/i.test(String(e?.message)) ? `Can't create it: the slug "${slug}" is already taken. Pick another.` : `Couldn't save it: ${String(e?.message).slice(0, 200)}`);
  process.exit(1);
}

const site = process.env.SITE ?? "https://geocricket.app";
console.log(`✓ ${title}: ${keys.map((k) => people.get(ALL[k].player).name).join(", ")}`);
console.log(`  Public link: ${site}/mystery/c/${slug}`);
console.log(`  Host link (send only to @${host}): ${site}/mystery/c/${slug}?host=${row.host_key}`);
console.log(`\nDM reply:\nYour challenge is live: "${title}". Play it first from your own link to set the score your followers have to beat (don't share this one): ${site}/mystery/c/${slug}?host=${row.host_key}\nThen post this link for your followers: ${site}/mystery/c/${slug}. Everyone who plays lands on your challenge's leaderboard.`);
