// (Re)creates the rounds scripts/qa.mjs plays (test-qa, test-qa2, evening-qa): fresh live questions, open now for 6 h.
// Local PGlite only, and only while the dev server is stopped (PGlite allows one process). Run before each QA pass.
// Usage: node scripts/qa-fixtures.mjs
import { PGlite } from "@electric-sql/pglite";

if (process.env.DATABASE_URL) throw new Error("qa-fixtures is local-only: unset DATABASE_URL");
const db = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
const TEST = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3], DAILY = [1, 1, 2, 3, 3];
const fixtures = [["test-qa", "test", "QA Test Match", TEST], ["test-qa2", "test", "QA Test 2", TEST], ["evening-qa", "evening", "QA Evening Daily", DAILY]];
const now = Date.now();
const used = new Set((await db.query("select question_ids from rounds where date not in ('test-qa','test-qa2','evening-qa')")).rows.flatMap((r) => r.question_ids));
const pool = (await db.query("select id from questions where status = 'live' and pool = 'edition' order by random()")).rows.map((r) => r.id).filter((id) => !used.has(id));
for (const [date, kind, title, mults] of fixtures) {
  const ids = pool.splice(0, mults.length);
  await db.query(
    `insert into rounds (date, question_ids, kind, title, mults, opens_ms, closes_ms) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (date) do update set question_ids = excluded.question_ids, mults = excluded.mults, opens_ms = excluded.opens_ms, closes_ms = excluded.closes_ms`,
    [date, ids, kind, title, mults, now - 60_000, now + 6 * 3600_000],
  );
  // Clear earlier QA plays of these rounds so first-attempt rules don't block the next run.
  for (const t of ["scores", "guesses", "starts"]) await db.query(`delete from ${t} where date = $1`, [date]);
}
console.log("QA fixtures ready until", new Date(now + 6 * 3600_000).toISOString());
await db.close();
