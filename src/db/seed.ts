// Upserts all questions, schedules dailies from a start date (default: today in IST), the Match Day editions,
// and the next weekend's Test Match. Usage: pnpm db:seed [YYYY-MM-DD]
import { sql } from "drizzle-orm";
import { MATCH_DAYS, POOL, TEST_MULTS } from "../content/pool";
import { BANK, SCHEDULE } from "../content/questions";
import { addDays, istDate, testWindow } from "../lib/game";
import { getDb, schema } from "./index";

const istMs = (iso: string) => Date.parse(iso);

async function main() {
  const db = await getDb();
  const start = process.argv[2] ?? istDate();
  const all = [...BANK, ...POOL];
  const ids = new Set(all.map((q) => q.id));
  if (ids.size !== all.length) throw new Error("Duplicate question ids between BANK and POOL");
  const check = (list: string[]) => list.forEach((id) => { if (!ids.has(id)) throw new Error(`Unknown question: ${id}`); });
  SCHEDULE.forEach(check);
  MATCH_DAYS.forEach((m) => check(m.questionIds));

  await db.insert(schema.questions).values(all).onConflictDoUpdate({
    target: schema.questions.id,
    set: {
      text: sql`excluded.text`, answer: sql`excluded.answer`, when: sql`excluded.when_text`,
      lat: sql`excluded.lat`, lng: sql`excluded.lng`, scaleKm: sql`excluded.scale_km`,
      story: sql`excluded.story`, source: sql`excluded.source`, region: sql`excluded.region`,
    },
  });

  type Row = typeof schema.rounds.$inferInsert;
  const rows: Row[] = SCHEDULE.map((questionIds, i) => ({ date: addDays(start, i), questionIds, kind: "daily" }));

  rows.push(...MATCH_DAYS.map((m) => ({
    date: m.key, kind: "match", title: m.title, questionIds: m.questionIds, opensMs: istMs(m.opens), closesMs: istMs(m.closes),
  })));

  // Game 2 every day: a 10-ball Test Match, open 24 hours from 8 PM IST. Built from pool questions not used by a Match Day,
  // for as many days as there are 10 fresh questions (approved AI drafts in the "edition" pool extend this).
  const used = new Set(MATCH_DAYS.flatMap((m) => m.questionIds));
  const testPool = POOL.map((q) => q.id).filter((id) => !used.has(id));
  let tests = 0;
  for (let i = 0; i < SCHEDULE.length && (i + 1) * TEST_MULTS.length <= testPool.length; i++, tests++) {
    const day = addDays(start, i);
    rows.push({
      date: `test-${day}`, kind: "test", title: `Test Match · ${day}`, questionIds: testPool.slice(i * TEST_MULTS.length, (i + 1) * TEST_MULTS.length), mults: TEST_MULTS,
      ...testWindow(day),
    });
  }

  // Pools: a question belongs to exactly one mode for life. Scheduled → daily/edition; the rest split Nets / Versus.
  const pool = new Map<string, string>();
  rows.forEach((r) => r.questionIds.forEach((id) => pool.set(id, r.kind === "daily" ? "daily" : "edition")));
  all.filter((q) => !pool.has(q.id)).forEach((q, i) => pool.set(q.id, i % 2 ? "versus" : "nets"));
  for (const [id, p] of pool) await db.update(schema.questions).set({ pool: p }).where(sql`${schema.questions.id} = ${id}`);

  for (const r of rows) {
    await db.insert(schema.rounds).values(r).onConflictDoUpdate({
      target: schema.rounds.date,
      set: { questionIds: r.questionIds, kind: r.kind, title: r.title ?? null, mults: r.mults ?? null, opensMs: r.opensMs ?? null, closesMs: r.closesMs ?? null },
    });
  }
  console.log(`Seeded ${all.length} questions, ${SCHEDULE.length} dailies from ${start}, ${MATCH_DAYS.length} Match Day, ${tests} daily Test Matches.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
