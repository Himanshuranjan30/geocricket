// Loads content/cricsheet/candidates.json into the questions table as "queued" (skipping ids we have and near-duplicates
// of existing questions), then releases the first N into play. Daily cron releases 100 more (src/lib/release.ts).
// Usage: pnpm exec tsx --conditions=react-server [--env-file=.env.neon] scripts/cricsheet-import.mts [releaseNow]
import { readFileSync } from "node:fs";
import { getDb, schema } from "../src/db";
import { releaseQueued } from "../src/lib/release";

type C = { id: string; text: string; answer: string; when: string; lat: number; lng: number; scaleKm: number; story: string; source: string; region: string };
const cands: C[] = JSON.parse(readFileSync("content/cricsheet/candidates.json", "utf8"));
const db = await getDb();
const { questions } = schema;
const existing = await db.select({ id: questions.id, lat: questions.lat, lng: questions.lng, when: questions.when, text: questions.text }).from(questions);
const ids = new Set(existing.map((q) => q.id));
const surname = (t: string) => (t.match(/^Where did ([A-Za-z' -]+?) (?:score|take|win)/)?.[1] ?? "").split(" ").pop()?.toLowerCase() ?? "";
// A hand-written question about the same player at the same ground in the same year is the same moment.
const dupe = (c: C) => existing.some((q) => Math.abs(q.lat - c.lat) < 0.05 && Math.abs(q.lng - c.lng) < 0.05 && q.when.includes(c.when.slice(-4)) && !!surname(c.text) && q.text.toLowerCase().includes(surname(c.text)));
const fresh = cands.filter((c) => !ids.has(c.id) && !dupe(c));
const t0 = Date.now();
for (let i = 0; i < fresh.length; i += 500) {
  const chunk = fresh.slice(i, i + 500).map((c, j) => ({ ...c, pool: "nets", status: "queued", origin: "cricsheet", createdAt: new Date(t0 + i + j) }));
  await db.insert(questions).values(chunk).onConflictDoNothing();
}
console.log(`queued ${fresh.length} (skipped ${cands.length - fresh.length} existing/duplicate)`);
const n = Number(process.argv[2] ?? 0);
if (n) console.log("released", JSON.stringify(await releaseQueued(n)));
process.exit(0);
