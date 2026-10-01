// End-to-end test of Who's the Player? against a running server: real HTTP, one cookie jar per simulated player.
// Usage: node scripts/who-e2e.mjs [baseUrl]   (default http://localhost:3000). Writes guesses and results, so point it
// at a local or staging server, not production.
const BASE = process.argv[2] ?? "http://localhost:3000";
let failed = 0;
const ok = (cond, msg) => { console.log(cond ? "✓" : "✗", msg); if (!cond) failed++; };

class Player {
  constructor() { this.jar = new Map(); }
  async req(path, body, raw) {
    const r = await fetch(BASE + path, {
      method: body !== undefined || raw ? "POST" : "GET",
      headers: { "content-type": "application/json", cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
  view() { return this.req("/api/who").then((r) => r.data); }
  guess(idx, pick, date) { return this.req("/api/who/guess", { date: date ?? this.date, idx, pick }); }
}

const pool = (await new Player().req("/api/who/players")).data;
ok(Array.isArray(pool) && pool.length > 100, `player pool served (${pool.length} players)`);
const ids = new Set(pool.map((p) => p.id));

// ---- 1. A fresh visitor sees only clue 1 and no answers ----
const a = new Player();
const v0 = await a.view();
a.date = v0.date;
ok(v0.items?.length === 3, `day #${v0.number} (${v0.date}) has 3 players`);
ok(v0.items.every((i) => i.clues.length === 1 && i.clues[0].kind === "pin" && i.clues[0].pins?.length === 1), "each starts on clue 1 with a ground pin");
ok(v0.items.every((i) => i.answer === null), "no answer in a fresh view");
ok(!a.jar.size, "looking doesn't create a player (no cookie until the first guess)");

// Learn the answers the way a player would: give up on each puzzle, from a throwaway player.
const spy = new Player(); spy.date = v0.date;
for (let idx = 0; idx < 3; idx++) for (let s = 0; s < 5; s++) await spy.guess(idx, null);
const answers = (await spy.view()).items.map((i) => i.answer.id);
ok(answers.every((id) => ids.has(id)), `answers are in the guess pool (${answers.join(", ")})`);
const wrong = pool.map((p) => p.id).filter((id) => !answers.includes(id));

// ---- 2. Rules: wrong guess and skip each reveal one clue; solving scores by clue ----
let r = await a.guess(0, wrong[0]);
ok(r.status === 200 && r.data.correct === false && r.data.view.items[0].clues.length === 2, "wrong guess → clue 2");
ok(r.data.view.items[0].misses[0] === pool.find((p) => p.id === wrong[0]).name, "the miss is shown by name");
ok(a.jar.size > 0, "first guess creates a guest player");
r = await a.guess(0, wrong[0]);
ok(r.status === 400 && /already tried/.test(r.data.error), "the same wrong pick twice is rejected");
r = await a.guess(0, null);
ok(r.data.view.items[0].clues.length === 3 && r.data.view.items[0].clues[2].kind === "numbers", "skip → clue 3 (the numbers)");
r = await a.guess(0, wrong[1]);
ok(r.data.view.items[0].clues[3].kind === "trail" && r.data.view.items[0].clues[3].pins.length >= 3, "clue 4 is the career trail with 3+ pins");
r = await a.guess(0, answers[0]);
ok(r.data.correct === true && r.data.view.items[0].points === 40 && r.data.view.items[0].solvedAt === 3, "solved on clue 4 → 40 points");
ok(r.data.view.items[0].answer?.story?.length > 20 && r.data.view.items[0].clues.length === 5, "solved puzzle shows the story and all five clues");
r = await a.guess(0, answers[0]);
ok(r.status === 200 && r.data.view.items[0].points === 40, "guessing again after solving changes nothing");

// ---- 3. Points on every clue ----
for (let k = 0; k < 5; k++) {
  const p = new Player(); p.date = v0.date;
  for (let s = 0; s < k; s++) await p.guess(1, null);
  const res = await p.guess(1, answers[1]);
  ok(res.data.view.items[1].points === [100, 80, 60, 40, 20][k], `solve on clue ${k + 1} → ${[100, 80, 60, 40, 20][k]}`);
}
const quitter = new Player(); quitter.date = v0.date;
for (let s = 0; s < 5; s++) r = await quitter.guess(2, wrong[s + 10]);
ok(r.data.view.items[2].done && r.data.view.items[2].points === 0 && r.data.view.items[2].answer, "five misses → 0 points, answer revealed");
r = await quitter.guess(2, answers[2]);
ok(r.data.view.items[2].points === 0, "can't solve after running out of clues");

// ---- 4. Bad input ----
for (const [body, why] of [
  [{ date: v0.date, idx: 9, pick: null }, "idx out of range"], [{ date: v0.date, idx: -1, pick: null }, "negative idx"],
  [{ date: v0.date, idx: 0.5, pick: null }, "fractional idx"], [{ date: v0.date, idx: "0", pick: "zzz-nobody" }, "unknown player"],
  [{ date: "2099-01-01", idx: 0, pick: null }, "future date"], [{ date: "2020-01-01", idx: 0, pick: null }, "unscheduled past date"],
  [{ idx: 0, pick: null }, "missing date"],
]) { const x = await new Player().req("/api/who/guess", body); ok(x.status === 400, `rejects ${why} (${x.status})`); }
const junk = await new Player().req("/api/who/guess", undefined, "{not json");
ok(junk.status === 400 || junk.status === 405, `rejects malformed JSON (${junk.status})`);
ok((await new Player().req("/api/who?date=2099-01-01")).status === 404, "GET a future day → 404");

// ---- 5. Concurrency: ten identical taps count once ----
const c = new Player(); c.date = v0.date;
await c.guess(1, wrong[3]); // creates the cookie first, like a real player
await Promise.all(Array.from({ length: 10 }, () => c.guess(1, wrong[4])));
const cv = await c.view();
ok(cv.items[1].step === 2 && cv.items[1].misses.length === 2, `10 parallel taps of one pick count once (step ${cv.items[1].step})`);
// Wrong and right pick racing on the same clue: one wins the step; "correct" is only claimed if it was recorded.
const [rw, rr] = await Promise.all([c.guess(1, wrong[5]), c.guess(1, answers[1])]);
const cv2 = await c.view();
ok(cv2.items[1].solvedAt === null ? rr.data.correct !== true : true, `a racing correct pick never claims success it didn't record (solvedAt ${cv2.items[1].solvedAt})`);
ok(rw.status === 200 && rr.status === 200, "both racing requests answer cleanly");

// ---- 6. Finishing the day: result, share, percentile, XP once ----
const finish = async (p, picks) => { for (let idx = 0; idx < 3; idx++) for (const pick of picks[idx]) { const x = await p.guess(idx, pick); if (x.data.view?.items[idx].done) break; } return p.view(); };
const crowd = [];
for (let n = 0; n < 6; n++) { const p = new Player(); p.date = v0.date; crowd.push(await finish(p, [[...Array(n % 5).fill(null), answers[0]], [answers[1]], [null, null, null, null, null]])); }
await new Promise((res) => setTimeout(res, 1500)); // results are saved after the response
const star = new Player(); star.date = v0.date;
const sv = await finish(star, [[answers[0]], [answers[1]], [answers[2]]]);
ok(sv.finished && sv.total === 300, "perfect day = 300");
await new Promise((res) => setTimeout(res, 1500));
const sv2 = await star.view();
ok(sv2.result?.share?.includes("🟩🟩🟩  300/300") && sv2.result.share.includes("Clues: 1 · 1 · 1"), "share text shows the tiles and clues");
ok(typeof sv2.result?.betterThan === "number" && sv2.result.betterThan >= 80, `percentile appears once 5+ players finished (better than ${sv2.result?.betterThan}%)`);
ok(!/Cook|Gambhir|Stokes/.test(sv2.result.share) && !answers.some((id) => sv2.result.share.includes(id)), "share text has no answers in it");
const me1 = (await star.req("/api/me")).data;
ok(me1?.streak >= 1, `finishing a Who day counts for the streak (streak ${me1?.streak})`);
await star.guess(2, answers[2]); await new Promise((res) => setTimeout(res, 1200));
const sv3 = await star.view();
ok(sv3.total === 300 && JSON.stringify(sv3.result) === JSON.stringify(sv2.result), "a guess after finishing changes nothing");
const photoed = pool.filter((p) => p.photo).length;
ok(photoed > 100, `player pool carries photo flags (${photoed} with photos)`);
const board = (await star.req("/api/boards?board=who&period=day&limit=5")).data;
ok(board?.me?.value === 300, `who board holds the player's 300 (me ${JSON.stringify(board?.me?.value)})`);
const pts = (await star.req("/api/boards?board=points&period=day")).data;
ok(pts?.me?.value >= 300, `points board includes Who points (${pts?.me?.value})`);
const rk = (await star.req("/api/boards?board=ranking&period=day")).data;
ok(rk?.me != null, `ranking counts the Who game (${JSON.stringify(rk?.me?.value)})`);

// ---- 7. Resume: a fresh fetch reproduces the same state ----
const back = await a.view();
ok(back.items[0].done && back.items[0].points === 40 && back.items[1].clues.length === 1, "a reload resumes exactly where the player left off");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
