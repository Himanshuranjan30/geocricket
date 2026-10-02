// Edge-case suite for creator challenges: every kind of player against a running server.
// Usage: node scripts/challenge-edge-e2e.mjs <baseUrl> <slug5> <hostKey5> <slug3> <hostKey3> <inactiveSlug>
// (a 5-player challenge, a 3-player one, and one set to active=false). Writes data: local/staging only.
import { readFileSync } from "node:fs";

const [BASE, A, KA, B, KB, OFF] = process.argv.slice(2);
const daily = JSON.parse(readFileSync("src/content/who.json", "utf8"));
const bank = JSON.parse(readFileSync("src/content/who-duel.json", "utf8")).puzzles;
const ALL = [...Object.values(daily.puzzles), ...Object.values(bank)];
const pool = daily.players.map((p) => p.id);
let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(c ? "✓" : "✗", m); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Answers the way a player learns them: a throwaway player gives up on every puzzle and reads the reveals.

class P {
  constructor(name) { this.jar = new Map(); this.name = name; }
  async req(path, body) {
    const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body && JSON.stringify(body) });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
  view(slug, extra = "") { return this.req(`/api/who?set=${encodeURIComponent(`c:${slug}`)}${extra}`).then((r) => r.data); }
  guess(slug, idx, pick) { return this.req("/api/who/guess", { date: `c:${slug}`, idx, pick }); }
  profile(handle) { return this.req("/api/me", { handle, avatar: "edgeqa-gold", country: "IN" }); }
  me() { return this.req("/api/me").then((r) => r.data); }
}
async function answers(slug) {
  const spy = new P("spy"), v = await spy.view(slug);
  for (const it of v.items) for (let s = 0; s < 5; s++) await spy.guess(slug, it.idx, null);
  return (await spy.view(slug)).items.map((it) => it.answer.id);
}
// Play a whole challenge: plan[i] = clues to burn before solving (skips), or "miss" to run out of clues.
async function play(p, slug, plan, ans) {
  for (let i = 0; i < ans.length; i++) {
    if (plan[i] === "miss") { for (let s = 0; s < 5; s++) await p.guess(slug, i, null); continue; }
    for (let s = 0; s < plan[i]; s++) await p.guess(slug, i, null);
    await p.guess(slug, i, ans[i]);
  }
  await sleep(900);
  return p.view(slug);
}
const POINTS = [100, 80, 60, 40, 20];

const ansA = await answers(A), ansB = await answers(B);
ok(ansA.length === 5 && ansA.every(Boolean) && ansB.length === 3, `challenges loaded (A: 5 players, B: 3 players)`);

// ---- 1. Bad sets and injection: never a crash, never an answer ----
for (const [set, why] of [["c:", "empty slug"], ["c:../etc", "path traversal"], ["c:a' or '1'='1", "SQL-ish slug"], [`c:${A.toUpperCase()}`, "wrong case"], [`c:${OFF}`, "inactive challenge"], ["c:x".repeat(200), "very long slug"]]) {
  const r = await new P().req(`/api/who?set=${encodeURIComponent(set)}`);
  ok(r.status === 404 && !r.data.items, `GET ${why} → 404`);
}
const offGuess = await new P().req("/api/who/guess", { date: `c:${OFF}`, idx: 0, pick: null });
ok(offGuess.status === 400, `guess on an inactive challenge rejected (${offGuess.status})`);
for (const [body, why] of [[{ date: `c:${B}`, idx: 3, pick: null }, "idx past a 3-player set"], [{ date: `c:${B}`, idx: -1, pick: null }, "negative idx"], [{ date: `c:${A}`, idx: 0, pick: "nobody-xyz" }, "unknown player"], [{ date: `c:${A}`, idx: 1.5, pick: null }, "fractional idx"]]) {
  const r = await new P().req("/api/who/guess", body);
  ok(r.status === 400, `rejects ${why} (${r.status})`);
}

// ---- 2. A guest plays before the host exists: no host score anywhere ----
const guest = new P("guest");
const g0 = await guest.view(A);
ok(g0.challenge.hostTotal === null && !g0.challenge.isHost && g0.challenge.players === 1, "first visitor: no host score (only the spy has played)");
ok(!guest.jar.size, "just looking creates no player");
let r = await guest.guess(A, 0, pool.find((id) => id !== ansA[0]));
ok(r.status === 200 && r.data.correct === false && r.data.view.items[0].clues.length === 2, "wrong name → next clue");
ok(guest.jar.size > 0, "first guess creates a guest");
r = await guest.guess(A, 0, r.data.view.items[0].misses.length && pool.find((id) => id !== ansA[0]));
ok(r.status === 400, "same wrong name twice rejected");
// Resume: a "reload" (fresh fetch) continues where they were.
const resumed = await guest.view(A);
ok(resumed.items[0].step === 1 && resumed.items[0].clues.length === 2 && resumed.items[1].step === 0, "reload resumes mid-puzzle");
// The daily is untouched by challenge play.
const dailyView = (await guest.req("/api/who")).data;
ok(dailyView.items.every((i) => i.step === 0 || i.done), "challenge guesses don't leak into the daily");
const gv = await play(guest, A, [1, 2, 3, 4, "miss"], ansA); // continues: puzzle 0 already on clue 2
ok(gv.finished && gv.total === 60 + 60 + 40 + 20 + 0, `guest mixed run = ${gv.total} (puzzle 1 already had a miss)`);
ok(gv.items[4].done && gv.items[4].points === 0 && gv.items[4].answer, "running out of clues reveals the answer, 0 points");

// ---- 3. Named players, a skipper, a quitter ----
const named = new P("named"); await named.profile(`edge${Date.now() % 1e7}`);
const nv = await play(named, A, [0, 0, 0, 0, 0], ansA);
ok(nv.total === 500 && nv.challenge.top[0].me && !/^Guest$/.test(nv.challenge.top[0].handle), "named player's perfect run tops the board under their name");
const skipper = new P("skipper");
const sv = await play(skipper, A, [4, 4, 4, 4, 4], ansA);
ok(sv.total === 100, `solving everything on the last clue = ${sv.total}`);
const quitter = new P("quitter");
const qv = await play(quitter, A, ["miss", "miss", "miss", "miss", "miss"], ansA);
ok(qv.finished && qv.total === 0 && qv.result.share.includes("0/500"), "quitter finishes with 0 and can still share");

// ---- 4. Host arrives late (after followers), imposters fail ----
const imposter = new P("imposter");
await imposter.view(A, `&host=${KB}`); // a real key, but for the other challenge
ok((await imposter.view(A)).challenge.isHost === false, "another challenge's host key doesn't work here");
const host = new P("host"); await host.profile(`hst${Date.now() % 1e7}`);
ok((await host.view(A, `&host=${KA}`)).challenge.isHost, "host claims with the key");
const hv = await play(host, A, [1, 0, 1, 0, 1], ansA);
const hostTotal = 80 + 100 + 80 + 100 + 80;
ok(hv.total === hostTotal && hv.challenge.isHost, `host run = ${hostTotal}`);
ok(hv.challenge.top.find((t) => t.host)?.handle === hv.challenge.hostHandle, "host row shows the challenge's host handle");
const late = new P("late-follower");
const lv0 = await late.view(A);
ok(lv0.challenge.hostTotal === hostTotal && lv0.challenge.hostSteps.join() === "1,0,1,0,1", "followers now see the host's score and clues");
ok((await new P().view(A, `&host=${KA}`)).challenge.isHost === false, "once the host has played, the key can't move the seat");

// ---- 5. Ten players finish at the same moment; ten identical taps count once ----
const crowd = Array.from({ length: 10 }, (_, i) => new P(`crowd${i}`));
await Promise.all(crowd.map((p, i) => play(p, B, [i % 5, (i + 1) % 5, (i + 2) % 5], ansB)));
const tap = new P("tapper");
await tap.guess(B, 0, null);
// Ten taps of "next clue" sent while the player was on clue 2 (step 1): only the first counts.
await Promise.all(Array.from({ length: 10 }, () => tap.req("/api/who/guess", { date: `c:${B}`, idx: 0, pick: null, step: 1 })));
ok((await tap.view(B)).items[0].step === 2, "10 taps of Next clue on the same clue advance once");
const stale = await tap.req("/api/who/guess", { date: `c:${B}`, idx: 0, pick: ansB[0], step: 0 });
ok(stale.status === 200 && !stale.data.correct && (await tap.view(B)).items[0].step === 2, "a retried request for an earlier clue is ignored");
await Promise.all([tap.guess(B, 0, ansB[0]), tap.guess(B, 0, pool.find((id) => id !== ansB[0]))]);
const tv = await tap.view(B);
ok(tv.items[0].done ? tv.items[0].points === 60 : tv.items[0].step === 3, `racing right/wrong on one clue settles cleanly (${tv.items[0].done ? "solved, 60" : "miss, clue 4"})`);
const bv = await new P().view(B);
ok(bv.challenge.players === 11, `all 10 crowd results saved, plus the spy (${bv.challenge.players})`);
const totals = bv.challenge.top.map((t) => t.total);
ok(totals.every((t, i) => i === 0 || totals[i - 1] >= t), "leaderboard sorted by score");
ok(bv.challenge.hostTotal === null, "challenge B has no host yet (hosts are per challenge)");

// ---- 6. Nothing leaks into the rest of the game ----
const me = await named.me();
ok(me.streak === 0, "challenge play doesn't start a streak");
const boards = await Promise.all(["who", "points", "ranking"].map((b) => named.req(`/api/boards?board=${b}&period=day`).then((x) => x.data)));
ok(boards.every((b) => !b.me), "no Mystery/points/ranking rows from challenges");
ok(me.level.xp === Math.round(500 / 20), `XP once at half rate (${me.level.xp})`);
await named.guess(A, 0, ansA[0]); await sleep(800);
ok((await named.me()).level.xp === me.level.xp, "replaying a finished challenge pays nothing");

// ---- 7. A guest who later names themselves shows up under the new name ----
const before = (await guest.view(A)).challenge.me;
ok(before?.handle === "Guest", "guest listed as Guest");
await guest.profile(`late${Date.now() % 1e7}`);
const after = (await guest.view(A)).challenge.me;
ok(after && after.handle !== "Guest", `after picking a name they're listed as ${after?.handle}`);

// ---- 8. Answers never leak before a puzzle is done ----
const fresh = await new P().view(A);
const raw = JSON.stringify(fresh);
ok(fresh.items.every((i) => !i.answer && i.clues.length === 1), "fresh view: one clue each, no answers");
ok(ansA.every((id) => !raw.includes(id)) && !raw.includes("story"), "no answer ids or stories in a fresh view");

console.log(failed ? `\n${failed} of ${n} checks failed` : `\nall ${n} checks passed`);
process.exit(failed ? 1 : 0);
