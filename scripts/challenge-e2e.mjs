// End-to-end test of Mystery Cricketer creator challenges against a running server.
// Usage: node scripts/challenge-e2e.mjs <baseUrl> <slug> <hostKey>   (create one first with scripts/challenge.mjs).
// Writes guesses and results, so point it at a local or staging server, not production.
import { readFileSync } from "node:fs";

const [BASE, SLUG, KEY] = process.argv.slice(2);
const SET = `c:${SLUG}`;
const daily = JSON.parse(readFileSync("src/content/who.json", "utf8"));
const bank = JSON.parse(readFileSync("src/content/who-duel.json", "utf8")).puzzles;
const ALL = [...Object.values(daily.puzzles), ...Object.values(bank)];
let failed = 0;
const ok = (c, m) => { console.log(c ? "✓" : "✗", m); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class P {
  constructor() { this.jar = new Map(); }
  async req(path, body) {
    const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body && JSON.stringify(body) });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
  view(extra = "") { return this.req(`/api/who?set=${encodeURIComponent(SET)}${extra}`).then((r) => r.data); }
  guess(idx, pick) { return this.req("/api/who/guess", { date: SET, idx, pick }); }
  me() { return this.req("/api/me").then((r) => r.data); }
}
// Oracle: the puzzle whose first two clues match what's on screen (players see the same text).
const answerOf = (clues) => ALL.find((p) => clues.every((c, i) => p.clues[i].text === c.text))?.player;
async function play(p, cluesBeforeSolving) {
  const v0 = await p.view();
  for (const it of v0.items) {
    for (let s = 0; s < cluesBeforeSolving; s++) await p.guess(it.idx, null);
    const v = await p.view();
    await p.guess(it.idx, answerOf(v.items[it.idx].clues));
  }
  await sleep(1200);
  return p.view();
}

// ---- fresh visitor: card data, no answers ----
const v = await new P().view();
ok(v.items?.length >= 3 && v.challenge?.slug === SLUG, `challenge served (${v.items?.length} cricketers, "${v.challenge?.title}")`);
ok(v.items.every((i) => i.clues.length === 1 && !i.answer), "only clue 1 each, no answers");
ok(v.challenge.hostTotal === null && v.challenge.isHost === false, "no host score before the host plays");
ok((await new P().req("/api/who?set=c:no-such-thing")).status === 404, "unknown challenge → 404");

// ---- host claims with the secret key; a wrong key does nothing ----
const imposter = new P();
await imposter.view("&host=wrongkey123");
ok((await imposter.view()).challenge.isHost === false, "wrong host key doesn't seat you as host");
const host = new P();
await host.req("/api/me", { handle: `h${Date.now() % 1e8}`, avatar: "hostqa-gold", country: "IN" });
ok((await host.view(`&host=${KEY}`)).challenge.isHost === true, "host link seats the host");
const thief = new P();
ok((await thief.view(`&host=${KEY}`)).challenge.isHost === false, "the host seat can't be taken twice");

// ---- host plays (all on clue 1): score to beat, XP at half rate, nothing else moves ----
const xp0 = (await host.me()).level.xp;
const hv = await play(host, 0);
const max = hv.items.length * 100;
ok(hv.finished && hv.total === max, `host perfect run = ${hv.total}`);
ok(hv.result?.share.includes(`/mystery/c/${SLUG}`) && hv.result.share.includes(hv.challenge.title), "share text names the challenge and links it");
ok(hv.challenge.top[0]?.host && hv.challenge.top[0].me, "host tops the leaderboard, marked host");
const me1 = await host.me();
ok(me1.level.xp - xp0 === Math.round(max / 20), `XP at half rate (+${me1.level.xp - xp0})`);
ok(me1.streak === 0, `a challenge doesn't start a streak (streak ${me1.streak})`);
const wb = (await host.req("/api/boards?board=who&period=day")).data, pb = (await host.req("/api/boards?board=points&period=day")).data, rb = (await host.req("/api/boards?board=ranking&period=day")).data;
ok(!wb.me && !pb.me && !rb.me, "no Mystery, points or ranking board row from a challenge");

// ---- a follower: sees the score to beat, ranks below the host ----
const fan = new P();
const fv0 = await fan.view();
ok(fv0.challenge.hostTotal === max && fv0.challenge.hostSteps?.every((s) => s === 0), "follower sees the host's score and clues");
const fv = await play(fan, 1);
ok(fv.total === hv.items.length * 80, `follower solving on clue 2 = ${fv.total}`);
ok(fv.challenge.players === 2 && fv.challenge.me?.rank === 2 && !fv.challenge.me.host, "follower ranked 2nd of 2");
ok(fv.challenge.top.every((t) => !/^guest_\d+$/.test(t.handle)), "guest handles are shown as Guest");
const again = await fan.guess(0, answerOf(fv.items[0].clues));
ok(again.status === 200 && (await fan.view()).total === fv.total, "replaying a finished challenge changes nothing");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
