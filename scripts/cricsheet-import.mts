// Loads question candidates (content/cricsheet/candidates.json + content/wikidata/candidates.json, both strongest first)
// into the questions table as "queued", skipping ids we have and near-duplicates of hand-written questions, then releases
// the first N into play. Existing Cricsheet questions whose id is rebuilt get the new wording when the answer is unchanged.
// Daily cron releases 100 more (src/lib/release.ts).
// Usage: pnpm exec tsx --conditions=react-server [--env-file=.env.neon] scripts/cricsheet-import.mts [releaseNow]
import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { releaseQueued } from "../src/lib/release";

type C = { id: string; text: string; answer: string; when: string; lat: number; lng: number; scaleKm: number; story: string; source: string; region: string; score: number };
const SOURCES = [["content/cricsheet/candidates.json", "cricsheet"], ["content/wikidata/candidates.json", "wikidata"]] as const;
// scripts/verify-questions.mjs audits (<dir>/dump.audit.json): skip any pin OpenStreetMap places more than 50 km away.
const far = new Set(SOURCES.flatMap(([f]) => { const a = f.replace("candidates.json", "dump.audit.json"); return existsSync(a) ? JSON.parse(readFileSync(a, "utf8")) as { id: string; kind: string; detail: string }[] : []; })
  .filter((x) => x.kind === "pin-far-from-venue" && Number(x.detail.match(/^(\d+) km/)?.[1]) > 50).map((x) => x.id));
const cands = SOURCES.flatMap(([f, origin]) => existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as C[]).map((c) => ({ ...c, origin })) : [])
  .filter((c) => !far.has(c.id)).sort((a, b) => b.score - a.score);
console.log(`dropped ${far.size} far-off pins`);
const db = await getDb();
const { questions } = schema;
const existing = await db.select({ id: questions.id, lat: questions.lat, lng: questions.lng, when: questions.when, text: questions.text, answer: questions.answer, origin: questions.origin }).from(questions);
const byId = new Map(existing.map((q) => [q.id, q]));
const handWritten = existing.filter((q) => q.origin !== "cricsheet" && q.origin !== "wikidata");
// The person a candidate is about: the story always opens with their name ("Kumar Sangakkara made 319 …").
const surname = (c: C) => (c.story.match(/^([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){0,3}) (?:made|returned|took|was born)/)?.[1] ?? "").split(" ").pop()?.toLowerCase() ?? "";
// A hand-written question about the same person at the same place (and year, for matches) is the same moment.
const dupe = (c: C) => { const s = surname(c); return !!s && s.length > 2 && handWritten.some((q) => Math.abs(q.lat - c.lat) < 0.05 && Math.abs(q.lng - c.lng) < 0.05
  && (c.id.startsWith("wd-") || q.when.includes(c.when.slice(-4))) && q.text.toLowerCase().includes(s)); };

let reworded = 0;
for (const c of cands) {
  const q = byId.get(c.id);
  if (q && q.origin === "cricsheet" && q.answer === c.answer && q.text !== c.text) { await db.update(questions).set({ text: c.text, story: c.story }).where(eq(questions.id, c.id)); reworded++; }
}
const fresh = cands.filter((c) => !byId.has(c.id) && !dupe(c));
const t0 = Date.now();
for (let i = 0; i < fresh.length; i += 500) {
  const chunk = fresh.slice(i, i + 500).map(({ score, ...c }, j) => ({ ...c, pool: "nets", status: "queued", createdAt: new Date(t0 + i + j) }));
  await db.insert(questions).values(chunk).onConflictDoNothing();
}
console.log(`queued ${fresh.length} (skipped ${cands.length - fresh.length} existing/duplicate), reworded ${reworded}`);
const n = Number(process.argv[2] ?? 0);
if (n) console.log("released", JSON.stringify(await releaseQueued(n)));
