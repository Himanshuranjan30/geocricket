// Self-serve hosting (/mystery/host): anyone with a player hosts a challenge as themselves. Against a running server.
// Usage: node scripts/host-e2e.mjs <baseUrl>   (writes players and challenges: local/staging only)
const BASE = process.argv[2];
let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(c ? "✓" : "✗", m); if (!c) failed++; };
class P {
  constructor() { this.jar = new Map(); }
  async req(path, body, method) {
    const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "content-type": "application/json", cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body && JSON.stringify(body) });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
  host(title, players) { return this.req("/api/challenges", { title, players }); }
}

const { data: pool } = await new P().req("/api/challenges");
const usable = pool.candidates.filter((c) => c.usable).map((c) => c.id), blocked = pool.candidates.filter((c) => !c.usable).map((c) => c.id);
ok(usable.length > 50 && pool.mine.length === 0, `picker lists ${usable.length} usable players (${blocked.length} held back), nothing hosted yet`);
ok(pool.candidates.slice(0, 5).every((c) => c.usable), "usable players listed first");

// No profile → asked to set one up first
const anon = new P();
let r = await anon.host("My Picks", usable.slice(0, 3));
ok(r.status === 403 && r.data.needProfile, "hosting with no player → set up first");

// A player with a profile hosts, as themselves
const me = new P(); const handle = `hst${Date.now() % 1e7}`;
await me.req("/api/me", { handle, avatar: "hosttest-gold", country: "IN" });
for (const [title, players, why] of [["ab", usable.slice(0, 3), "title too short"], ["Two only", usable.slice(0, 2), "2 players"], ["Six", usable.slice(0, 6), "6 players"], ["Held back", [...usable.slice(0, 2), blocked[0]].filter(Boolean), "a player due in the daily"], ["x".repeat(61), usable.slice(0, 3), "61-char title"]]) {
  if (why.includes("daily") && !blocked.length) continue;
  r = await me.host(title, players);
  ok(r.status === 400 && r.data.error, `rejects ${why} ("${r.data.error}")`);
}
r = await me.host("Dupes Count Once", [usable[0], usable[0], usable[1], usable[2]]);
ok(r.status === 200, "duplicate picks count once (3 distinct is fine)");
r = await me.host("<script>alert(1)</script> Legends", usable.slice(3, 7));
ok(r.status === 200 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.data.slug) && r.data.slug.startsWith("script-alert-1-script"), `slug is made safe from the title (${r.data.slug})`);
const { slug } = r.data;
const v = (await me.req(`/api/who?set=c:${slug}`)).data;
ok(v.challenge?.isHost === true && v.challenge.hostHandle === handle, "creator is the host straight away, under their own handle");
ok(v.challenge.title.includes("<script>") && v.items.length === 4, "title kept as text (React escapes it); 4 players");
r = await me.host("Third One", usable.slice(8, 11));
ok(r.status === 200, "third challenge today OK");
r = await me.host("Fourth One", usable.slice(12, 15));
ok(r.status === 400 && /3 new challenges a day/.test(r.data.error), "4th in a day refused (spam limit)");

// Their list; another player plays it
const mine = (await me.req("/api/challenges")).data.mine;
ok(mine.length === 3 && mine.every((c) => c.plays === 0), "'Your challenges' lists their 3, none played yet");
const fan = new P();
for (let i = 0; i < 4; i++) for (let s = 0; s < 5; s++) await fan.req("/api/who/guess", { date: `c:${slug}`, idx: i, pick: null });
await new Promise((res) => setTimeout(res, 900));
ok((await me.req("/api/challenges")).data.mine.find((c) => c.slug === slug)?.plays === 1, "a follower's play shows in the host's list");
ok((await fan.req("/api/challenges")).data.mine.length === 0, "other players don't see your challenges as theirs");

// Admin tools stay admin-only
ok((await me.req("/api/admin/challenges")).status === 403, "admin list: 403 for players");
ok((await me.req("/api/admin/challenges", { slug, active: false }, "PATCH")).status === 403, "players can't switch challenges off via admin API");
ok((await me.req("/api/admin/challenges", { slug: "x-y", title: "t", host: "a", players: usable.slice(0, 3) })).status === 403, "players can't use the admin create (no hosting as someone else)");

console.log(failed ? `\n${failed} of ${n} checks failed` : `\nall ${n} checks passed`);
process.exit(failed ? 1 : 0);
