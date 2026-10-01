// Brings the questions table in line with the verified build. Dry run unless --apply.
// - Every Cricsheet question is reset to its rebuilt candidate (content/cricsheet/candidates.json, from
//   scripts/cricsheet-build.mjs): answer = Cricsheet's venue name, cross-checked pin, real knockout stage, 500 km scale.
// - Cricsheet questions the stricter build no longer produces (unverifiable venue, repeated text) are retired,
//   unless a round already uses them.
// - Story/text corrections from the hand-written fact-check (<dump dir>/manual-audit.json).
// Usage: pnpm exec tsx --conditions=react-server --env-file=.env.neon scripts/fix-questions.mts <questions.json> [--apply]
import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";

type Row = { id: string; text: string; answer: string; story: string; when_text: string; lat: number; lng: number; scale_km: number; origin: string; status: string };
const dump = process.argv[2], apply = process.argv.includes("--apply");
const rows: Row[] = JSON.parse(readFileSync(dump, "utf8"));
const cands = new Map((JSON.parse(readFileSync("content/cricsheet/candidates.json", "utf8")) as Record<string, string & number>[]).map((c) => [c.id, c]));
const manualFile = dump.replace(/[^/]+$/, "manual-audit.json");
const manual: { id: string; verdict: string; fix?: Record<string, string> }[] = existsSync(manualFile) ? JSON.parse(readFileSync(manualFile, "utf8")) : [];

const db = await getDb();
const { questions, rounds } = schema;
const used = new Set((await db.select({ ids: rounds.questionIds }).from(rounds)).flatMap((r) => r.ids));
const updates = new Map<string, Record<string, unknown>>();
const kinds: Record<string, number> = {};
const note = (k: string) => { kinds[k] = (kinds[k] ?? 0) + 1; };

for (const r of rows) {
  if (r.origin !== "cricsheet" || r.status === "rejected") continue;
  const c = cands.get(r.id);
  if (!c) { if (used.has(r.id)) note("unverified but already played (kept)"); else { updates.set(r.id, { status: "rejected" }); note("retired"); } continue; }
  const patch: Record<string, unknown> = {};
  if (c.text !== r.text) { patch.text = c.text; note("text"); }
  if (c.answer !== r.answer) { patch.answer = c.answer; note("answer"); }
  if (c.story !== r.story) patch.story = c.story;
  if (Math.hypot(c.lat - r.lat, c.lng - r.lng) > 0.05) { patch.lat = c.lat; patch.lng = c.lng; note("pin moved (>5 km)"); }
  if (c.scaleKm !== r.scale_km) { patch.scaleKm = c.scaleKm; note("scale"); }
  if (Object.keys(patch).length) updates.set(r.id, patch);
}
for (const f of manual) if (f.verdict !== "ok" && f.fix) {
  updates.set(f.id, { ...updates.get(f.id), ...Object.fromEntries(Object.entries(f.fix).filter(([k]) => ["text", "story", "answer", "lat", "lng"].includes(k))) });
  note("hand-written fix");
}

console.log(`${updates.size} questions to change:`, kinds);
for (const [id, p] of [...updates].filter(([, p]) => p.lat).slice(0, 8)) {
  const r = rows.find((x) => x.id === id)!;
  console.log(" pin:", id, `"${r.answer}" (${r.lat.toFixed(2)},${r.lng.toFixed(2)}) → "${p.answer ?? r.answer}" (${Number(p.lat).toFixed(2)},${Number(p.lng).toFixed(2)})`);
}
if (apply) {
  for (const [id, p] of updates) await db.update(questions).set(p).where(eq(questions.id, id));
  console.log("applied", updates.size);
}
process.exit(0);
