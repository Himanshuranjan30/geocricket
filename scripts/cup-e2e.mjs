// End-to-end Cups test against a running server: real HTTP, one cookie session per player.
// 1. 12 players race to join an 8-seat cup at once → exactly 8 seated, 4 waitlisted.
// 2. 8 players host/join/start a cup and play every match (some players skip rounds) until there's a champion.
// Usage: node scripts/cup-e2e.mjs [baseUrl]   (default http://localhost:3000)
const BASE = process.argv[2] ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Player {
  constructor(name) { this.name = name; this.cookies = new Map(); }
  async req(path, body) {
    const res = await fetch(BASE + path, {
      method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.cookies.set(kv.slice(0, i), kv.slice(i + 1)); }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
  async setup(i) {
    await this.req("/api/me");
    const r = await this.req("/api/me", { handle: "", avatar: `r${i % 5}${i % 5}${i % 6}${i % 2}-india`, country: ["IN", "AU", "GB", "PK", "ZA", "NZ"][i % 6] });
    if (r.status !== 200) throw new Error(`${this.name} setup failed: ${JSON.stringify(r.data)}`);
    return this;
  }
}

const assert = (cond, msg) => { if (!cond) { console.error("✗", msg); process.exit(1); } console.log("✓", msg); };

// ---- 1. Concurrent overfill ----
const racers = await Promise.all(Array.from({ length: 13 }, (_, i) => new Player(`r${i}`).setup(i)));
const made = await racers[0].req("/api/cups", { name: "Race Cup", capacity: 8, startsMs: Date.now() + 30 * 60_000, visibility: "private" });
assert(made.status === 200, `host creates a cup (${made.data.code})`);
const joins = await Promise.all(racers.slice(1).map((p) => p.req(`/api/cups/${made.data.code}`, { action: "join" })));
const seated = joins.filter((j) => j.data.seat).length, waiting = joins.filter((j) => j.data.waitlist).length;
assert(seated === 7 && waiting === 5, `12 simultaneous joins on 7 free seats → ${seated} seated, ${waiting} waitlisted`);
const view = (await racers[0].req(`/api/cups/${made.data.code}`)).data;
assert(view.entrants.length === 8 && new Set(view.entrants.map((e) => e.alias)).size === 8, "8 unique seats, no player ids exposed");
assert(!JSON.stringify(view).match(/[0-9a-f]{8}-[0-9a-f]{4}-/), "view contains no ids");
const leaver = racers.find((_, i) => joins[i - 1]?.data.seat && i > 0);
await leaver.req(`/api/cups/${made.data.code}`, { action: "leave" });
const after = (await racers[0].req(`/api/cups/${made.data.code}`)).data;
assert(after.entrants.length === 8 && after.waitlist === 4, "a seat freed by leaving goes to the first waitlisted player");
for (const p of racers) await p.req(`/api/cups/${made.data.code}`, { action: "leave" }); // tidy up (host leaves last → cancelled or handed over)

// ---- 2. Full 8-player cup ----
const ps = await Promise.all(Array.from({ length: 8 }, (_, i) => new Player(`p${i + 1}`).setup(i + 20)));
const cup = await ps[0].req("/api/cups", { name: "E2E Cup", capacity: 8, startsMs: Date.now() + 10 * 60_000, visibility: "private" });
assert(cup.status === 200, "host creates the E2E cup");
const code = cup.data.code;
for (const p of ps.slice(1)) await p.req(`/api/cups/${code}`, { action: "join" });
const early = await ps[0].req(`/api/cups/${code}`, { action: "start" });
assert(early.status === 200, `host starts early with everyone in the lobby (${JSON.stringify(early.data)})`);

const lazy = new Set(["p7"]); // p7 never opens their matches → must lose by walkover
const guessed = new Set();
let last = "", v;
const t0 = Date.now();
while (Date.now() - t0 < 25 * 60_000) {
  for (const p of ps) {
    v = (await p.req(`/api/cups/${code}`)).data;
    const m = v.me?.match;
    if (!m || lazy.has(p.name)) continue;
    const d = (await p.req(`/api/live/${m}`)).data;
    const r = d.round;
    if (d.status === "playing" && r?.text && !r.myGuess && !r.resolvedMs && !guessed.has(`${m}:${r.n}:${p.name}`)) {
      guessed.add(`${m}:${r.n}:${p.name}`);
      const lat = -60 + Math.random() * 120, lng = -180 + Math.random() * 360;
      await p.req(`/api/live/${m}/guess`, { round: r.n, lat, lng });
    }
  }
  const line = `${v.phase} · round ${v.round + 1}/${v.rounds} · ${v.bracket.map((b) => `${b.name}: ${b.fixtures.map((f) => `${f.a ?? "-"}v${f.b ?? "-"}${f.winner ? `→${f.winner}${f.how === "walkover" ? "(wo)" : ""}` : ""}`).join(" ")}`).join(" | ")}`;
  if (line !== last) { console.log("  ", line); last = line; }
  if (v.phase === "done" || v.phase === "cancelled") break;
  await sleep(1500);
}
assert(v.phase === "done", "cup finished");
assert(v.winner && v.places[v.winner] === 1 && v.places[v.runnerUp] === 2, `champion ${v.winner}, runner-up ${v.runnerUp}`);
assert(Object.keys(v.places).length === 8, "every player has a final place");
const p7 = v.entrants.find((e) => e.handle && ps[6]) && v.bracket[0].fixtures.find((f) => [f.a, f.b].some((x) => x && v.places[x] && x !== f.winner));
assert(!!p7, "first-round losers recorded");
const lazyAlias = (await ps[6].req(`/api/cups/${code}`)).data.me.alias;
assert(v.bracket[0].fixtures.some((f) => (f.a === lazyAlias || f.b === lazyAlias) && f.winner !== lazyAlias && f.how === "walkover"), `no-show ${lazyAlias} lost by walkover`);
console.log("all good in", Math.round((Date.now() - t0) / 1000), "s");
