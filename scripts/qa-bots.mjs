// Leaderboard QA: N simulated players (own cookie each) play today's Daily with a planned accuracy, so every total is
// known in advance. Writes the plan to <out.json> for the checks. Local only.
// Usage: node scripts/qa-bots.mjs <answers.json> <out.json> [baseUrl]
import { readFileSync, writeFileSync } from "node:fs";
const ANS = JSON.parse(readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
const BASE = process.argv[4] ?? "http://localhost:3000";

class P {
  constructor(handle, country) { this.handle = handle; this.country = country; this.cookies = new Map(); }
  async req(path, body) {
    const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body ? JSON.stringify(body) : undefined });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.cookies.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {}
    return { status: r.status, data };
  }
}

// [handle, country, per-ball plan]: "x" = exact pin (100), "f" = far pin (0), a number = degrees of latitude off.
const PLAN = [
  ["QA_Ace", "IN", "xxxxx"], ["QA_Tied1", "AU", "xxxxf"], ["QA_Tied2", "GB", "xxxxf"], ["QA_Mid", "IN", "x1x1x"],
  ["QA_Ok", "PK", "11111"], ["QA_Low", "ZA", "ff1fx"], ["QA_Zero", "NZ", "fffff"], ["QA_Lk1", "LK", "x2f2x"],
  ["QA_Lk2", "LK", "2x2x2"], ["QA_Au2", "AU", "3333x"], ["QA_In3", "IN", "fxfxf"], ["QA_Gb2", "GB", "x3x3f"],
];
const out = [];
for (const [handle, country, plan] of PLAN) {
  const p = new P(handle, country);
  const prof = await p.req("/api/me", { handle, country, avatar: "r0000-india", age: true, ageConfirmed: true });
  if (prof.status !== 200) { console.log("profile failed", handle, prof.status, JSON.stringify(prof.data)); continue; }
  const balls = [];
  for (let i = 0; i < 5; i++) {
    const s = await p.req("/api/start", { idx: i });
    const [lat, lng] = ANS[s.data?.id] ?? [0, 0];
    const c = plan[i];
    const pin = c === "x" ? { lat, lng } : c === "f" ? { lat: -lat, lng: lng + 179 } : { lat: lat + Number(c), lng };
    const g = await p.req("/api/guess", { idx: i, ...pin });
    balls.push({ points: g.data?.points, km: g.data?.km, mult: g.data?.mult });
  }
  const pts = balls.map((b) => b.points ?? 0);
  out.push({ handle, country, plan, balls: pts, doneMs: Date.now() });
  console.log(handle.padEnd(10), country, plan, pts.join(","));
  await new Promise((r) => setTimeout(r, 1100)); // distinct finish times for the tie-break
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
