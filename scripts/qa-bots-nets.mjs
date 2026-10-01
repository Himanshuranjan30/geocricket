// Accuracy/Effort QA. Phase "make": create profiles and save their cookies. (Link them to users in the local DB.)
// Phase "play": each plays 30 Nets balls with a planned accuracy. Local only.
// Usage: node scripts/qa-bots-nets.mjs make <state.json> | play <state.json> <answers.json> [baseUrl]
import { readFileSync, writeFileSync } from "node:fs";
const [phase, STATE, ANSF] = process.argv.slice(2);
const BASE = process.argv[5] ?? "http://localhost:3000";
const req = async (cookie, path, body) => {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.getSetCookie().map((c) => c.split(";")[0]);
  return { status: r.status, data: await r.json().catch(() => null), set };
};
const BOTS = [["QA_Sniper", "IN", 0], ["QA_Decent", "AU", 1], ["QA_Wild", "GB", 4]]; // degrees off per ball
if (phase === "make") {
  const out = [];
  for (const [handle, country, off] of BOTS) {
    const r = await req("", "/api/me", { handle, country, avatar: "r0000-india" });
    out.push({ handle, country, off, cookie: r.set.join("; ") });
    console.log(handle, r.status);
  }
  writeFileSync(STATE, JSON.stringify(out));
} else {
  const ANS = JSON.parse(readFileSync(ANSF, "utf8"));
  for (const b of JSON.parse(readFileSync(STATE, "utf8"))) {
    const pts = [];
    while (pts.length < 30) {
      const s = await req(b.cookie, "/api/practice");
      for (const q of s.data?.questions ?? []) {
        if (pts.length >= 30) break;
        const [lat, lng] = ANS[q.id];
        const g = await req(b.cookie, "/api/check", { id: q.id, lat: lat + b.off, lng });
        pts.push(g.data?.points ?? -1);
      }
    }
    console.log(b.handle, "avg", (pts.reduce((a, c) => a + c, 0) / pts.length).toFixed(1), "90+:", pts.filter((p) => p >= 90).length);
  }
}
