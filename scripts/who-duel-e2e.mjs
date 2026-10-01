// End-to-end test of the Who's the Player? 1v1 Name Race and the "beat my Who" challenge link, against a running
// server on the real clock (takes ~3 minutes). Usage: node scripts/who-duel-e2e.mjs [baseUrl]. Writes matches,
// players and results, so point it at a local or staging server, not production.
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const BANK = JSON.parse(readFileSync("src/content/who-duel.json", "utf8")).puzzles;
const DAILY = JSON.parse(readFileSync("src/content/who.json", "utf8"));
let failed = 0;
const ok = (cond, msg) => { console.log(cond ? "✓" : "✗", msg); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Player {
  constructor() { this.jar = new Map(); }
  async req(path, body) {
    const r = await fetch(BASE + path, {
      method: body !== undefined ? "POST" : "GET",
      headers: { "content-type": "application/json", cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
  async profile() {
    const handle = `t${Math.random().toString(36).slice(2, 10)}`;
    const r = await this.req("/api/me", { handle, avatar: "etwoe-india", country: "IN" });
    this.handle = handle;
    return r;
  }
  view(id) { return this.req(`/api/who-duel/${id}`).then((r) => r.data); }
  buzz(id, round, pick) { return this.req(`/api/who-duel/${id}/buzz`, { round, pick }); }
  xp() { return this.req("/api/me").then((r) => r.data?.level?.xp ?? 0); }
}

// Answer oracle for the test: the bank puzzle whose clues match what's on screen. Two big moments from the same match
// share clues 1–2, so it waits for a clue that tells them apart.
const candidates = (clues) => [...new Set(Object.values(BANK).filter((p) => clues.every((c, i) => p.clues[i].text === c.text)).map((p) => p.player))];
async function answerFor(p, id, round) {
  for (;;) {
    const v = await p.view(id);
    if (v.round.n !== round || v.round.result) return null;
    const c = candidates(v.round.clues);
    if (c.length === 1) return c[0];
    await sleep(400);
  }
}
async function until(p, id, pred, ms = 45_000) {
  const end = Date.now() + ms;
  for (;;) { const v = await p.view(id); if (pred(v) || Date.now() > end) return v; await sleep(300); }
}

const pool = (await new Player().req("/api/who/players")).data;
const wrongFor = (answer) => pool.find((p) => p.id !== answer).id;

// ---- 1. Private invite: create, join, a third person bounced ----
const A = new Player(), B = new Player(), C = new Player();
ok((await new Player().req("/api/who-duel", { mode: "private" })).status === 403, "starting a race needs a player profile");
for (const p of [A, B, C]) await p.profile();
const made = await A.req("/api/who-duel", { mode: "private" });
const id = made.data.id;
ok(made.status === 200 && id && made.data.matched === false, `private race created (${id})`);
let v = await A.view(id);
ok(v.status === "open" && v.players.length === 1 && v.players[0].me, "lobby waits with one player");
ok(!JSON.stringify(v).includes(A.jar.get("pm_pid") ?? "∅"), "no player id in the view");
ok((await B.req(`/api/who-duel/${id}/join`, {})).status === 200, "friend joins from the link");
ok((await C.req(`/api/who-duel/${id}/join`, {})).status === 409, "a third person can't take a seat");

// ---- 2. Countdown: nothing visible yet ----
v = await B.view(id);
ok(v.status === "playing" && v.round.n === 0 && v.round.clue === -1 && v.round.clues.length === 0 && !v.round.result, "countdown shows no clue");
ok(v.players.map((p) => p.slot).join() === "p0,p1" && v.players.find((p) => p.me)?.slot === "p1", "players are slots, joiner is p1");

// ---- 3. Round 1: lockout, opponent sees the miss, first right name wins ----
v = await A.view(id);
await sleep(Math.max(0, v.round.openMs - v.now) + 200);
v = await A.view(id);
ok(v.round.clue === 0 && v.round.clues.length === 1 && v.round.clues[0].kind === "pin" && !v.round.result, "clue 1 lands: the ground, no answer");
const ans0 = candidates(v.round.clues).length === 1 ? candidates(v.round.clues)[0] : await answerFor(A, id, 0);
ok(!!ans0, "oracle found the round's player");
ok((await C.buzz(id, 0, ans0)).status === 403, "an outsider can't buzz");
ok((await A.buzz(id, 0, "zzz-nobody")).status === 400, "unknown player rejected");
ok((await A.buzz(id, 1, ans0)).status === 409, "wrong round rejected");
let r = await A.buzz(id, 0, wrongFor(ans0));
ok(r.status === 200 && r.data.correct === false, "wrong name accepted as a miss");
r = await A.buzz(id, 0, ans0);
ok(r.status === 409 && r.data.locked, "a second name on the same clue is locked out");
v = await B.view(id);
ok(v.round.buzzes.some((b) => b.slot === "p0" && !b.correct && b.name), "rival sees the wrong name");
r = await B.buzz(id, 0, ans0);
ok(r.data.correct === true, "right name scores");
v = await A.view(id);
ok(v.round.result?.winner === "p1" && v.round.result.clue === 0 && v.round.result.answer?.id === ans0 && v.round.result.answer.story, "round over: winner, clue and answer revealed");
ok(v.wins.p1 === 1 && v.pts.p1 === 100 && v.wins.p0 === 0, "B leads 1–0 with 100 points");
ok((await A.buzz(id, 0, ans0)).status === 409, "no buzzing after the round ends");

// ---- 4. Round 2: both right at the same moment → one winner ----
v = await until(A, id, (x) => x.round.n === 1 && x.round.clue === 0);
const ans1 = await answerFor(A, id, 1);
const both = await Promise.all([A.buzz(id, 1, ans1), B.buzz(id, 1, ans1)]);
v = await A.view(id);
ok(v.round.result && v.wins.p0 + v.wins.p1 === 2, `simultaneous right names: one round, one winner (${v.round.result?.winner})`);
ok(both.filter((x) => x.status === 200 || x.status === 409).length === 2, "both racing requests answer cleanly");

// ---- 5. Play it out: B names first until the match ends ----
const xpA0 = await A.xp(), xpB0 = await B.xp();
for (let guard = 0; guard < 6; guard++) {
  v = await until(B, id, (x) => x.status === "done" || (!x.round.result && x.round.clue === 0));
  if (v.status === "done") break;
  const ans = await answerFor(B, id, v.round.n);
  if (ans) await B.buzz(id, v.round.n, ans);
}
v = await until(A, id, (x) => x.status === "done");
const bWon = v.winner === "p1";
ok(v.status === "done" && v.winner && Math.max(v.wins.p0, v.wins.p1) === 3, `match ends at three (${v.wins.p0}–${v.wins.p1}, winner ${v.winner})`);
ok(v.log.length === v.wins.p0 + v.wins.p1 && v.log.every((l) => l.answer?.name), "match log has every round's player");
await sleep(800);
for (let i = 0; i < 3; i++) await A.view(id); // more ticks must not pay out again
const xpA1 = await A.xp(), xpB1 = await B.xp();
ok(xpB1 - xpB0 === (bWon ? 25 : 10) && xpA1 - xpA0 === (bWon ? 10 : 25), `XP once: winner +25, loser +10 (A +${xpA1 - xpA0}, B +${xpB1 - xpB0})`);
const today = DAILY.days ? Object.keys(DAILY.days).sort() : [];
const soon = new Set(today.filter((d) => d >= new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)).slice(0, 22).flatMap((d) => DAILY.days[d].map((k) => DAILY.puzzles[k].player)));
ok(v.log.every((l) => !soon.has(l.answer.id)), "no player due in the daily soon appears in a race");

// ---- 6. Quick match pairs two strangers; an unmatched one gets the bot ----
const D = new Player(), E = new Player(), F = new Player();
for (const p of [D, E, F]) await p.profile();
const q1 = await D.req("/api/who-duel", { mode: "quick" });
const q2 = await E.req("/api/who-duel", { mode: "quick" });
ok(q1.data.matched === false && q2.data.matched === true && q2.data.id === q1.data.id, "quick match pairs the next stranger into the waiting lobby");
const q3 = await F.req("/api/who-duel", { mode: "quick" });
ok(q3.data.matched === false && q3.data.id !== q1.data.id, "nobody waiting: a new lobby");
ok((await D.req(`/api/who-duel/${q3.data.id}/bot`, {})).status === 409, "only the lobby's owner can call in the bot");
ok((await F.req(`/api/who-duel/${q3.data.id}/bot`, {})).status === 200, "owner gives up waiting and gets the bot");
v = await F.view(q3.data.id);
ok(v.status === "playing" && v.bot && v.players[1].bot && /Bot$/.test(v.players[1].handle), "bot seated and labelled as a bot");

// ---- 7. The bot plays: its buzzes appear on the clock, never ahead of it ----
const bm = await F.req("/api/who-duel", { mode: "bot" });
ok(bm.data.matched === true, "practice against the bot starts at once");
v = await until(F, bm.data.id, (x) => !!x.round?.result, 50_000);
ok(!!v.round.result && v.log.length === 1, `bot round resolves on its own (winner ${v.round.result?.winner ?? "nobody"}, clue ${v.round.result?.clue})`);
ok(v.round.buzzes.every((b) => b.slot === "p1"), "only the bot buzzed");

// ---- 8. "Beat my Who": the share link carries a code that shows the sharer's result to a friend ----
const spy = new Player();
for (let idx = 0; idx < 3; idx++) for (let s = 0; s < 5; s++) await spy.req("/api/who/guess", { date: (await spy.req("/api/who")).data.date, idx, pick: null });
const daily = (await spy.req("/api/who")).data;
const answers = daily.items.map((i) => i.answer.id);
const X = new Player(); await X.profile();
for (let idx = 0; idx < 3; idx++) await X.req("/api/who/guess", { date: daily.date, idx, pick: idx === 2 ? null : answers[idx] });
for (let s = 0; s < 4; s++) await X.req("/api/who/guess", { date: daily.date, idx: 2, pick: null });
const xv = (await X.req("/api/who")).data;
const code = xv.result?.share.match(/vs=([a-f0-9]{10})/)?.[1];
ok(xv.finished && xv.total === 200 && !!code, `share text carries a challenge code (${code})`);
ok(xv.result.share.includes(`date=${daily.date}`), "challenge link pins the day");
const Y = new Player();
const yv = (await Y.req(`/api/who?date=${daily.date}&vs=${code}`)).data;
ok(yv.rival?.total === 200 && yv.rival.handle === X.handle && yv.rival.steps.join() === "0,0,", `friend sees the sharer's score and handle (${yv.rival?.handle} ${yv.rival?.total})`);
ok(yv.items.every((i) => i.answer === null), "the rival's result reveals no answers");
ok((await Y.req(`/api/who?vs=0000000000`)).data.rival === null, "unknown code: no rival");
ok((await X.req(`/api/who?vs=${code}`)).data.rival === null, "your own link doesn't show you as your rival");
ok(!JSON.stringify(yv).includes(X.jar.get("pm_pid") ?? "∅"), "no player id in the challenge view");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
