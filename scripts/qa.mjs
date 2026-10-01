// Full-app QA suite against a running server: many independent players (one cookie session each), every mode,
// positive and negative paths, security checks. Records every result and prints a report; never stops early.
// Usage: node scripts/qa.mjs <answers.json> [baseUrl]   (answers.json: question id → [lat, lng], exported locally)
import { readFileSync } from "node:fs";
const ANS = JSON.parse(readFileSync(process.argv[2], "utf8"));
const BASE = process.argv[3] ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let suite = "";
const check = (name, ok, detail = "") => { results.push({ suite, name, ok: !!ok, detail }); console.log(`${ok ? "✓" : "✗"} [${suite}] ${name}${ok ? "" : `  → ${detail}`}`); return !!ok; };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

class P {
  static n = 0;
  constructor() { this.id = ++P.n; this.cookies = new Map(); }
  async req(path, body, method) {
    const t0 = Date.now();
    const res = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "content-type": "application/json", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.cookies.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ms: Date.now() - t0, text };
  }
  async guest(country = "IN", look = "r2031-india") {
    await this.req("/api/me");
    const r = await this.req("/api/me", { handle: "", avatar: look, country });
    this.profile = r.data.profile;
    return this;
  }
}
const players = async (n) => Promise.all(Array.from({ length: n }, (_, i) => new P().guest(["IN", "AU", "GB", "PK", "ZA", "NZ", "LK", "BD", "US", "IE"][i % 10], `r${i % 5}${i % 7}${i % 6}${i % 2}-${["india", "gold", "green", "navy", "black", "sky"][i % 6]}`)));
const near = (id, dLat = 0) => { const [lat, lng] = ANS[id]; return { lat: lat + dLat, lng }; };

// ───────────────────────── 1. Pages ─────────────────────────
suite = "pages";
{
  const p = new P();
  const pages = ["/", "/play", "/nets", "/practice", "/live", "/cups", "/groups", "/leaderboard", "/leaderboard?period=week", "/leaderboard?period=month", "/archive", "/archive/2026-09-29",
    "/locker", "/profile", "/settings", "/about", "/how-it-works", "/privacy", "/terms", "/refunds", "/test/test-qa", "/test/evening-qa", "/c/734", "/admin"];
  for (const path of pages) { const r = await p.req(path); check(`GET ${path} → 200 (or an intended redirect)`, r.status === 200 || (path === "/practice" && r.status === 307), `status ${r.status}`); check(`${path} loads under 3 s`, r.ms < 3000, `${r.ms} ms`); }
  for (const path of ["/does-not-exist", "/cup/zzzzzz", "/live/not-a-duel", "/g/nope", "/duel/nope"]) {
    const r = await p.req(path); check(`GET ${path} handles a bad link (200 page or 404, never 500)`, r.status === 200 || r.status === 404, `status ${r.status}`);
  }
}

// ───────────────────────── 2. Identity & profile ─────────────────────────
suite = "profile";
{
  const p = new P();
  const me0 = await p.req("/api/me");
  check("new visitor gets a player without a profile", me0.status === 200 && !me0.data.profile, JSON.stringify(me0.data).slice(0, 120));
  for (const [body, why] of [[{ handle: "ab", avatar: "r2031-india", country: "IN" }, "handle too short"], [{ handle: "bad name!", avatar: "r2031-india", country: "IN" }, "handle bad chars"],
    [{ handle: "okhandle", avatar: "not-an-avatar", country: "IN" }, "bad avatar"], [{ handle: "okhandle", avatar: "r2031-india", country: "XX" }, "bad country"], [{ handle: "<script>x", avatar: "r2031-india", country: "IN" }, "script in handle"]]) {
    const r = await p.req("/api/me", body); check(`rejects profile: ${why}`, r.status === 400, `status ${r.status}`);
  }
  const h = `qa${Date.now().toString(36).slice(-6)}`;
  const ok = await p.req("/api/me", { handle: h, avatar: "r2031-india", country: "IN" });
  check("valid profile saves", ok.status === 200 && ok.data.profile?.handle === h, JSON.stringify(ok.data));
  const q = new P(); await q.req("/api/me");
  const dup = await q.req("/api/me", { handle: h.toUpperCase(), avatar: "r2031-india", country: "IN" });
  check("duplicate handle (any case) is rejected", dup.status === 409, `status ${dup.status}`);
  const g = await new P().guest();
  check("blank handle gives a guest_###### handle", /^guest_\d{6}$/.test(g.profile?.handle ?? ""), g.profile?.handle);
  for (const look of ["r0000-india", "r4651-sky", "x0123456789-gold", "legacyseed-green"]) {
    const r = await new P().guest("IN", look); check(`avatar code accepted: ${look}`, !!r.profile, "no profile");
  }
  const lg = await new P().guest("IN", "legend:kohli");
  check("unowned legend avatar is refused or reset", lg.profile?.avatar !== "legend:kohli", lg.profile?.avatar);
}

// ───────────────────────── 3. Game windows ─────────────────────────
suite = "schedule";
{
  const p = await new P().guest();
  const r = await p.req("/api/round");
  const opensAt = r.data.opensMs;
  const open = r.status === 200;
  check("today's Daily: closed before its drop with a clear message, or open after it", open ? r.data.daily === true : r.status === 404 && /opens at/.test(r.data.error), JSON.stringify(r.data).slice(0, 140));
  if (!open) {
    const s = await p.req("/api/start", { idx: 0 }); check("can't start a Daily question before it opens", s.status === 404, `status ${s.status}`);
    const g = await p.req("/api/guess", { idx: 0, lat: 0, lng: 0 }); check("can't guess a Daily before it opens", g.status === 404, `status ${g.status}`);
    check("drop time is in the 8 AM–12 PM IST window", (() => { const h = new Date(opensAt + 5.5 * 3600e3).getUTCHours(); return h >= 8 && h <= 12; })(), new Date(opensAt).toISOString());
  }
  const eds = (await p.req("/api/editions")).data.editions;
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  for (const k of [`test-am-${today}`, `evening-${today}`, `test-${today}`]) {
    const e = eds.find((x) => x.key === k);
    check(`slot ${k} exists and closes at midnight IST`, e && new Date(e.closesMs + 5.5 * 3600e3).toISOString().slice(11, 16) === "23:59", JSON.stringify(e ?? null));
  }
  { const m = await p.req("/moments/gilchrist-149"); check("a moment page shows, or 404s while its question is live", m.status === 200 || m.status === 404, `${m.status}`); }
  const future = await p.req(`/api/round?key=test-${today}`);
  check("a slot that hasn't opened hides its questions", future.status === 404 || future.data.questions?.every((q) => q.text === null), `status ${future.status}`);
}

// ───────────────────────── 4. Test Match (scored, ×2 XP / −20) ─────────────────────────
suite = "test-match";
{
  const p = await new P().guest();
  const round = (await p.req("/api/round?key=test-qa")).data;
  check("Test Match loads 10 balls with texts hidden until started", round.questions?.length === 10 && round.questions.every((q) => q.text === null), JSON.stringify(round).slice(0, 120));
  const early = await p.req("/api/guess", { idx: 0, key: "test-qa", lat: 0, lng: 0 });
  check("guess before the question is started → 409", early.status === 409, `status ${early.status}`);
  const bad = await p.req("/api/start", { idx: 99, key: "test-qa" }); check("start an invalid ball → 400", bad.status === 400, `status ${bad.status}`);
  let xp0 = (await p.req("/api/career")).data.xp;
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const s = await p.req("/api/start", { idx: i, key: "test-qa" });
    check(`ball ${i + 1}: start reveals the text`, s.status === 200 && s.data.text, JSON.stringify(s.data).slice(0, 80));
    const id = round.questions[i].id, exact = i % 2 === 0;
    const g = await p.req("/api/guess", { idx: i, key: "test-qa", ...(exact ? near(id) : { lat: -ANS[id][0], lng: ANS[id][1] + 179 }) });
    const want = exact ? 100 : 0;
    check(`ball ${i + 1}: ${exact ? "exact pin scores 100" : "far pin scores 0"}`, g.data.points === want, `points ${g.data.points}`);
    check(`ball ${i + 1}: XP ${exact ? "= 100×mult×2" : "= −20"}`, g.data.xp === (exact ? 100 * round.questions[i].mult * 2 : -20), `xp ${g.data.xp}`);
    const again = await p.req("/api/guess", { idx: i, key: "test-qa", lat: 10, lng: 10 });
    check(`ball ${i + 1}: a second guess can't change the score`, again.data.points === g.data.points && again.data.xp === 0, JSON.stringify(again.data).slice(0, 80));
    total += g.data.points * round.questions[i].mult;
  }
  const done = (await p.req("/api/round?key=test-qa")).data;
  check("finished round shows all 10 balls", done.progress?.length === 10, `progress ${done.progress?.length}`);
  const xp1 = (await p.req("/api/career")).data.xp;
  check("net XP change is positive for 5 perfect balls", xp1 > xp0, `${xp0} → ${xp1}`);
  const lb = (await p.req("/api/leaderboard?date=test-qa")).data;
  check("Test Match leaderboard responds", lb && (Array.isArray(lb.players) || Array.isArray(lb.rows) || typeof lb === "object"), JSON.stringify(lb).slice(0, 100));

  // XP floor: a brand-new guest (level 1, 0 XP) scoring only poor balls never goes negative
  const z = await new P().guest();
  const r2 = (await z.req("/api/round?key=test-qa2")).data;
  for (let i = 0; i < 3; i++) { await z.req("/api/start", { idx: i, key: "test-qa2" }); const id = r2.questions[i].id; await z.req("/api/guess", { idx: i, key: "test-qa2", lat: -ANS[id][0], lng: ANS[id][1] + 179 }); }
  const zx = (await z.req("/api/career")).data.xp;
  check("XP never drops below the level floor (0 at level 1)", zx === 0, `xp ${zx}`);
  // timed-out ball
  await z.req("/api/start", { idx: 3, key: "test-qa2" });
  const to = await z.req("/api/guess", { idx: 3, key: "test-qa2", timedOut: true });
  check("time-out scores 0", to.data.points === 0, JSON.stringify(to.data).slice(0, 80));
  const unknown = await z.req("/api/guess", { idx: 0, key: "nope-round", lat: 0, lng: 0 });
  check("guess on an unknown round → 404", unknown.status === 404, `status ${unknown.status}`);
  const junk = await z.req("/api/guess", { idx: 5, key: "test-qa2", lat: 999, lng: "x" });
  check("junk coordinates → 400", junk.status === 400, `status ${junk.status}`);
  const noProf = new P(); await noProf.req("/api/me");
  const np = await noProf.req("/api/start", { idx: 0, key: "test-qa" });
  check("no profile → can't start a scored round (403)", np.status === 403, `status ${np.status}`);
}

// ───────────────────────── 5. Evening Daily (normal XP) ─────────────────────────
suite = "evening-daily";
{
  const p = await new P().guest();
  const r = (await p.req("/api/round?key=evening-qa")).data;
  check("evening Daily has 5 balls", r.questions?.length === 5, `${r.questions?.length}`);
  await p.req("/api/start", { idx: 0, key: "evening-qa" });
  const g = await p.req("/api/guess", { idx: 0, key: "evening-qa", ...near(r.questions[0].id) });
  check("evening Daily: 100 points, XP = points (no ×2)", g.data.points === 100 && g.data.xp === 100, JSON.stringify({ p: g.data.points, xp: g.data.xp }));
  check("evening Daily is not flagged as a Test", g.data.test === false, `${g.data.test}`);
}

// ───────────────────────── 6. Nets ─────────────────────────
suite = "nets";
{
  const p = await new P().guest();
  const seen = new Set();
  let repeats = 0, famous = 0, n = 0;
  for (let s = 0; s < 6; s++) {
    const d = (await p.req("/api/practice")).data;
    for (const q of d.questions) { if (seen.has(q.id)) repeats++; seen.add(q.id); n++; if (!q.id.startsWith("cs-") || /\b(India|Australia|England|Pakistan|South Africa|New Zealand|Sri Lanka|West Indies)\b/.test(q.text)) famous++; }
  }
  check("6 Nets sessions: no question repeats", repeats === 0, `${repeats} repeats`);
  check("Nets leads with well-known questions (≥80% major teams or hand-written)", famous / n >= 0.8, `${famous}/${n}`);
  const [first] = [...seen];
  const ex = await p.req("/api/check", { id: first, ...near(first) });
  check("Nets exact pin → 100 points and 100 XP", ex.data.points === 100 && ex.data.xp === 100, JSON.stringify(ex.data).slice(0, 100));
  const off = await p.req("/api/check", { id: first, ...near(first, 3) });
  check("Nets ~330 km off → ~51 points", off.data.points >= 45 && off.data.points <= 56, `${off.data.points}`);
  const to = await p.req("/api/check", { id: first, timedOut: true }); check("Nets time-out → 0", to.data.points === 0, `${to.data.points}`);
  const bad = await p.req("/api/check", { id: "", lat: 0, lng: 0 }); check("Nets missing id → 400", bad.status === 400, `${bad.status}`);
  const unk = await p.req("/api/check", { id: "no-such-q", lat: 0, lng: 0 }); check("Nets unknown id → 404", unk.status === 404, `${unk.status}`);
  const live = (await p.req("/api/round?key=test-qa")).data.questions[0].id;
  const leak = await p.req("/api/check", { id: live, lat: 0, lng: 0 });
  check("Nets can't be used to peek at a live round's answer (403)", leak.status === 403, `${leak.status}`);
}

// ───────────────────────── 7. Friend duel (async) ─────────────────────────
suite = "friend-duel";
{
  const [a, b] = await players(2);
  const made = await a.req("/api/duels", {});
  check("create a friend duel", made.status === 200 && made.data.id, JSON.stringify(made.data).slice(0, 100));
  if (made.data.id) {
    const d = await b.req(`/api/duels/${made.data.id}`);
    check("friend opens the duel", d.status === 200 && d.data.questions?.length >= 5, JSON.stringify(d.data).slice(0, 100));
    for (let i = 0; i < 5; i++) {
      const id = d.data.questions[i].id;
      const g = await b.req(`/api/duels/${made.data.id}/guess`, { idx: i, ...near(id) });
      check(`friend duel ball ${i + 1} exact → 100`, g.data.points === 100, JSON.stringify(g.data).slice(0, 80));
    }
    const bad = await b.req(`/api/duels/${made.data.id}/guess`, { idx: 9, lat: 0, lng: 0 });
    check("friend duel invalid ball → 400", bad.status === 400, `${bad.status}`);
  }
}

// ───────────────────────── 8. Live 1v1 ─────────────────────────
suite = "live-1v1";
{
  const [a, b, c] = await players(3);
  const q1 = await a.req("/api/live", { mode: "quick" });
  const q2 = await b.req("/api/live", { mode: "quick" });
  check("quick match pairs two players into the same duel", q1.data.id && q1.data.id === q2.data.id, `${q1.data.id} / ${q2.data.id}`);
  const id = q1.data.id;
  const third = await c.req(`/api/live/${id}/join`, {});
  check("a third player can't join a full duel (409)", third.status === 409, `${third.status}`);
  const spect = await c.req(`/api/live/${id}/guess`, { round: 0, lat: 0, lng: 0 });
  check("a non-player can't guess (403 or 409)", spect.status === 403 || spect.status === 409, `${spect.status}`);
  const view = await a.req(`/api/live/${id}`);
  check("duel view never exposes player ids", !UUID.test(view.text), "found a uuid");
  await sleep(4500);
  let rounds = 0, v = view.data;
  for (let t = 0; t < 40 && v.status !== "done"; t++) {
    v = (await a.req(`/api/live/${id}`)).data;
    const r = v.round;
    if (r?.text && !r.resolvedMs && !r.myGuess) {
      const qid = (await a.req(`/api/live/${id}`)).data; // text visible; answer via questions list isn't exposed, so aim with the export
      const all = Object.keys(ANS);
      void qid; void all;
    }
    if (r && !r.resolvedMs && r.text) {
      // player A pins near the answer (found by matching the question text isn't possible client-side): use two fixed far/near points
      await a.req(`/api/live/${id}/guess`, { round: r.n, lat: 19.07, lng: 72.87 });
      await b.req(`/api/live/${id}/guess`, { round: r.n, lat: -75, lng: -170 });
      rounds++;
    }
    const wrong = await a.req(`/api/live/${id}/guess`, { round: (r?.n ?? 0) + 5, lat: 0, lng: 0 });
    if (t === 0) check("guess for a future round → 409", wrong.status === 409, `${wrong.status}`);
    await sleep(1500);
  }
  check("live 1v1 finishes with a winner", v.status === "done" && v.winner, JSON.stringify({ s: v.status, w: v.winner }));
  const dmg = (v.log ?? []).reduce((t, l) => t + l.damage, 0);
  check("rounds deal real damage (not level pegging)", dmg > 0, JSON.stringify(v.log?.map((l) => l.damage)));
  check("HP reached 0 for the loser or match ran all rounds", Object.values(v.hp ?? {}).some((h) => h === 0) || (v.log ?? []).length === 10, JSON.stringify(v.hp));
  const priv = await a.req("/api/live", { mode: "private" });
  check("private duel lobby is created", priv.data.id && priv.data.id !== id, JSON.stringify(priv.data));
}

// ───────────────────────── 9. Cups ─────────────────────────
suite = "cups";
async function playCup(n, capacity, label, lazyEvery = 0) {
  const ps = await players(n);
  const made = await ps[0].req("/api/cups", { name: `${label} Cup`, capacity, startsMs: Date.now() + 20 * 60_000, visibility: "private" });
  if (!check(`${label}: host creates a ${capacity}-seat cup`, made.status === 200, JSON.stringify(made.data))) return;
  const code = made.data.code;
  const joins = await Promise.all(ps.slice(1).map((p) => p.req(`/api/cups/${code}`, { action: "join" })));
  const seatedN = 1 + joins.filter((j) => j.data.seat).length, waitN = joins.filter((j) => j.data.waitlist).length;
  check(`${label}: ${n} players → ${Math.min(n, capacity)} seated, ${Math.max(0, n - capacity)} waitlisted`, seatedN === Math.min(n, capacity) && waitN === Math.max(0, n - capacity), `${seatedN} seated, ${waitN} waiting`);
  const notHost = await ps[1].req(`/api/cups/${code}`, { action: "start" });
  check(`${label}: a non-host can't start (403)`, notHost.status === 403, `${notHost.status}`);
  for (const p of ps) await p.req(`/api/cups/${code}`); // everyone in the lobby
  const st = await ps[0].req(`/api/cups/${code}`, { action: "start" });
  check(`${label}: host starts with 4+ in the lobby`, st.status === 200, JSON.stringify(st.data));
  const lazy = new Set(lazyEvery ? ps.filter((_, i) => i % lazyEvery === lazyEvery - 1).map((p) => p.id) : []);
  let v; const t0 = Date.now(); const guessed = new Set(); let idLeak = false, doubleMatch = false;
  while (Date.now() - t0 < 30 * 60_000) {
    for (const p of ps) {
      const r = await p.req(`/api/cups/${code}`); v = r.data;
      if (UUID.test(r.text.replace(/"match":"[^"]+"/, ""))) idLeak = true; // your own match id is a public link; player ids must never appear
      const m = v.me?.match;
      if (!m || lazy.has(p.id)) continue;
      const d = (await p.req(`/api/live/${m}`)).data;
      const rr = d.round;
      if (d.status === "playing" && rr?.text && !rr.myGuess && !rr.resolvedMs && !guessed.has(`${m}:${rr.n}:${p.id}`)) {
        guessed.add(`${m}:${rr.n}:${p.id}`);
        await p.req(`/api/live/${m}/guess`, { round: rr.n, lat: -60 + Math.random() * 120, lng: -180 + Math.random() * 360 });
      }
    }
    if (v.phase === "running") {
      const inRound = v.bracket[v.round].fixtures.flatMap((f) => [f.a, f.b]).filter(Boolean);
      if (new Set(inRound).size !== inRound.length) doubleMatch = true;
    }
    if (v.phase === "done" || v.phase === "cancelled") break;
    await sleep(1200);
  }
  const field = Math.min(n, capacity);
  check(`${label}: cup finishes`, v.phase === "done", `phase ${v.phase}`);
  check(`${label}: exactly one champion and one runner-up`, v.winner && v.places[v.winner] === 1 && v.places[v.runnerUp] === 2, JSON.stringify(v.places));
  check(`${label}: every player in the field gets a place`, Object.keys(v.places).length === field, `${Object.keys(v.places).length}/${field}`);
  check(`${label}: nobody plays two matches in a round`, !doubleMatch, "double booking");
  check(`${label}: no player ids in any cup response`, !idLeak, "uuid seen");
  const byes = v.bracket[0].fixtures.filter((f) => f.how === "bye").length;
  const size = [4, 8, 16, 32].find((s) => s >= field);
  check(`${label}: ${size - field} byes in round 1`, byes === size - field, `${byes}`);
  if (lazy.size) check(`${label}: no-shows lose by walkover`, v.bracket.flat().length && v.bracket.some((b) => b.fixtures.some((f) => f.how === "walkover")), "no walkovers");
  const late = await ps[0].req(`/api/cups/${code}`, { action: "leave" });
  check(`${label}: can't leave after it started`, late.status === 409, `${late.status}`);
  const after = await new P().guest();
  const j = await after.req(`/api/cups/${code}`, { action: "join" });
  check(`${label}: can't join a finished cup`, j.status === 409, `${j.status}`);
  return code;
}
{
  // validation
  const h = await new P().guest();
  const bad = [[{ name: "ab", capacity: 8, startsMs: Date.now() + 3e5 }, "short name"], [{ name: "Fuck Cup", capacity: 8, startsMs: Date.now() + 3e5 }, "profanity"],
    [{ name: "Size Cup", capacity: 7, startsMs: Date.now() + 3e5 }, "bad size"], [{ name: "Past Cup", capacity: 8, startsMs: Date.now() - 1 }, "start in the past"], [{ name: "Far Cup", capacity: 8, startsMs: Date.now() + 8 * 864e5 }, "start > 7 days"]];
  for (const [body, why] of bad) { const r = await h.req("/api/cups", body); check(`cup create rejects: ${why}`, r.status === 400, `${r.status}`); }
  const c1 = await h.req("/api/cups", { name: "Limit One", capacity: 4, startsMs: Date.now() + 3e5 });
  const c2 = await h.req("/api/cups", { name: "Limit Two", capacity: 4, startsMs: Date.now() + 3e5 });
  const c3 = await h.req("/api/cups", { name: "Limit Three", capacity: 4, startsMs: Date.now() + 3e5 });
  check("at most 2 cups waiting per host", c1.status === 200 && c2.status === 200 && c3.status === 429, `${c1.status} ${c2.status} ${c3.status}`);
  const busy = await h.req(`/api/cups/${c2.data.code}`, { action: "join" });
  check("host of one waiting cup can't also join another (one cup at a time)", busy.status === 200 ? busy.data.seat === 1 : busy.status === 409, JSON.stringify(busy.data));
  const few = await h.req(`/api/cups/${c1.data.code}`, { action: "start" });
  check("can't start with fewer than 4 in the lobby", few.status === 409, `${few.status}`);
  const edit = await h.req(`/api/cups/${c1.data.code}`, { action: "edit", name: "Renamed Cup", capacity: 8 });
  check("host can rename and resize before check-in", edit.status === 200, JSON.stringify(edit.data));
  const shrink = await h.req(`/api/cups/${c1.data.code}`, { action: "edit", capacity: 5 });
  check("resize to a non-bracket size is rejected", shrink.status === 400, `${shrink.status}`);
  // host leaves → handover
  const [x, y] = await players(2);
  await x.req(`/api/cups/${c1.data.code}`, { action: "join" }); await y.req(`/api/cups/${c1.data.code}`, { action: "join" });
  await h.req(`/api/cups/${c1.data.code}`, { action: "leave" });
  const hv = (await x.req(`/api/cups/${c1.data.code}`)).data;
  check("host leaving hands the cup to the next player", hv.me?.host === true && hv.host?.handle === x.profile.handle, JSON.stringify(hv.host));
  const list = (await x.req("/api/cups")).data;
  check("cup list shows the official Daily Cup", list.open?.some((c) => c.official), JSON.stringify(list.open?.map((c) => c.name)));
  check("cup list shows my cups", list.mine?.some((c) => c.code === c1.data.code), "missing");
  const lbd = await x.req("/api/cups/leaderboard?period=week");
  check("cup leaderboard responds", lbd.status === 200 && Array.isArray(lbd.data.players), `${lbd.status}`);
  await x.req(`/api/cups/${c1.data.code}`, { action: "leave" }); await y.req(`/api/cups/${c1.data.code}`, { action: "leave" });
  await h.req(`/api/cups/${c2.data.code}`, { action: "leave" });

  // full cups, run in parallel: 4 exact, 5 (3 byes), 10 players in a 16 bracket with no-shows, 10 players on 8 seats (waitlist)
  await Promise.all([playCup(4, 4, "4p"), playCup(5, 8, "5p"), playCup(10, 16, "10p", 4), playCup(10, 8, "10-on-8")]);
}

// ───────────────────────── 10. Groups, boards, misc ─────────────────────────
suite = "social";
{
  const [a, b] = await players(2);
  const g = await a.req("/api/groups", { name: "QA Crew" });
  check("create a group", g.status === 200 && (g.data.code || g.data.group?.code), JSON.stringify(g.data).slice(0, 100));
  const code = g.data.code ?? g.data.group?.code;
  const j = await b.req("/api/groups/join", { code });
  check("friend joins with the code", j.status === 200, `${j.status} ${JSON.stringify(j.data).slice(0, 80)}`);
  const bad = await b.req("/api/groups/join", { code: "nope" }); check("bad group code → 404", bad.status === 404, `${bad.status}`);
  const board = await a.req(`/api/groups/${code}`); check("group board loads", board.status === 200, `${board.status}`);
  for (const period of ["day", "week", "month"]) { const r = await a.req(`/api/leaderboard?period=${period}`); check(`world leaderboard (${period})`, r.status === 200, `${r.status}`); }
  for (const path of ["/api/career", "/api/notifications", "/api/locker", "/api/offer", "/api/pulse", "/api/editions"]) { const r = await a.req(path); check(`GET ${path} → 200`, r.status === 200, `${r.status}`); }
  const n = (await a.req("/api/notifications")).data;
  const ids = (n.items ?? n.notifications ?? []).map((x) => x.id).filter(Boolean);
  if (ids.length) { const mr = await a.req("/api/notifications", { ids }); check("mark notifications read", mr.status === 200, `${mr.status}`); }
}

// ───────────────────────── 11. Security ─────────────────────────
suite = "security";
{
  const p = await new P().guest();
  for (const path of ["/api/cron/generate", "/api/cron/remind"]) { const r = await p.req(path); check(`${path} without the secret → 401`, r.status === 401, `${r.status}`); }
  const adm = await p.req("/api/admin/review"); check("admin review for a non-admin → 401/403", adm.status === 401 || adm.status === 403, `${adm.status}`);
  const admP = await p.req("/api/admin/review", { id: "x", action: "approve" }); check("admin approve for a non-admin → 401/403", admP.status === 401 || admP.status === 403, `${admP.status}`);
  const wh = await p.req("/api/pay/webhook", { type: "payment.succeeded", data: {} }); check("payment webhook rejects unsigned calls", wh.status >= 400 && wh.status < 500, `${wh.status}`);
  const conf = await p.req("/api/pay/confirm", { id: "fake" }); check("payment confirm with a fake id doesn't unlock anything", conf.status >= 400 || conf.data?.ok !== true, JSON.stringify(conf.data).slice(0, 80));
  const lb = await p.req("/api/leaderboard"); check("leaderboard exposes no player ids", !UUID.test(lb.text), "uuid");
  const pulse = await p.req("/api/pulse"); check("pulse exposes no player ids", !UUID.test(pulse.text), "uuid");
  const sub = await p.req("/api/push/subscribe", { endpoint: "https://evil.example/x", keys: {} }); check("push subscribe validates input", sub.status === 400 || sub.status === 200, `${sub.status}`);
}

// ───────────────────────── report ─────────────────────────
const bySuite = {};
for (const r of results) { bySuite[r.suite] ??= { pass: 0, fail: 0 }; bySuite[r.suite][r.ok ? "pass" : "fail"]++; }
console.log("\n==== QA REPORT ====");
for (const [s, c] of Object.entries(bySuite)) console.log(`${s.padEnd(14)} ${String(c.pass).padStart(4)} passed  ${String(c.fail).padStart(3)} failed`);
const failed = results.filter((r) => !r.ok);
console.log(`TOTAL ${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log(`FAIL [${f.suite}] ${f.name} → ${f.detail}`);
