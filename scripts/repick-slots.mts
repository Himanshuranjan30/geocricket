// Re-picks the questions of timed slots (Test Matches, evening Dailies) that haven't opened yet, best-known first, so
// rounds scheduled before the fame ranking existed aren't full of obscure fixtures. Never touches an open or played
// round. Dry run unless --apply. Usage: pnpm exec tsx --conditions=react-server [--env-file=.env.neon] scripts/repick-slots.mts [--apply]
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { fame } from "../src/lib/seen";

const apply = process.argv.includes("--apply");
const db = await getDb();
const { rounds, questions } = schema;
const now = Date.now();
const all = await db.select().from(rounds);
const upcoming = all.filter((r) => (r.kind === "test" || r.kind === "evening") && (r.opensMs ?? 0) > now).sort((a, b) => (a.opensMs ?? 0) - (b.opensMs ?? 0));
const keep = new Set(all.filter((r) => !upcoming.includes(r)).flatMap((r) => r.questionIds)); // used by open/past/other rounds
const pool = (await db.select({ id: questions.id, text: questions.text, origin: questions.origin }).from(questions).where(and(eq(questions.pool, "edition"), eq(questions.status, "live"))))
  .filter((q) => !keep.has(q.id)).sort((a, b) => fame(b) - fame(a));
const before = new Map((await db.select({ id: questions.id, text: questions.text, origin: questions.origin }).from(questions).where(inArray(questions.id, upcoming.flatMap((r) => r.questionIds)))).map((q) => [q.id, q]));
for (const r of upcoming) {
  const score = r.questionIds.reduce((t, id) => t + fame(before.get(id) ?? { text: "", origin: "cricsheet" }), 0) / r.questionIds.length;
  if (score >= 4.5) { console.log(`${r.date.padEnd(22)} fame ${score.toFixed(1)} · already fine, kept`); continue; }
  const ids = pool.splice(0, r.questionIds.length).map((q) => q.id);
  if (ids.length < r.questionIds.length) { console.log("pool too small for", r.date); break; }
  const avg = (xs: string[], m: Map<string, { text: string; origin: string }>) => (xs.reduce((t, id) => t + fame(m.get(id) ?? { text: "", origin: "cricsheet" }), 0) / xs.length).toFixed(1);
  const after = new Map((await db.select({ id: questions.id, text: questions.text, origin: questions.origin }).from(questions).where(inArray(questions.id, ids))).map((q) => [q.id, q]));
  console.log(`${r.date.padEnd(22)} fame ${avg(r.questionIds, before)} → ${avg(ids, after)}`);
  if (apply) await db.update(rounds).set({ questionIds: ids }).where(and(eq(rounds.date, r.date), gt(rounds.opensMs, Date.now())));
}
console.log(apply ? "applied" : "dry run");
process.exit(0);
