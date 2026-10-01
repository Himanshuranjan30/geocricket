import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Move the next `n` queued questions (imported from Cricsheet, strongest first) into play, spread across the pools
 * that keep growing: the daily Test Match ("edition"), Nets and Versus. Each question keeps its pool for life.
 */
export async function releaseQueued(n: number) {
  const db = await getDb();
  const { questions } = schema;
  const next = await db.select({ id: questions.id }).from(questions).where(eq(questions.status, "queued")).orderBy(asc(questions.createdAt)).limit(n);
  if (!next.length) return { released: 0 };
  const counts = Object.fromEntries((await db.select({ pool: questions.pool, n: sql<number>`count(*)::int` }).from(questions)
    .where(eq(questions.status, "live")).groupBy(questions.pool)).map((r) => [r.pool, r.n]));
  const lanes: Record<string, number> = { edition: counts.edition ?? 0, nets: counts.nets ?? 0, versus: counts.versus ?? 0 };
  const byPool: Record<string, string[]> = { edition: [], nets: [], versus: [] };
  for (const q of next) {
    const lane = Object.entries(lanes).sort((a, b) => a[1] - b[1])[0][0];
    lanes[lane]++; byPool[lane].push(q.id);
  }
  for (const [pool, ids] of Object.entries(byPool)) if (ids.length) await db.update(questions).set({ status: "live", pool }).where(inArray(questions.id, ids));
  return { released: next.length, byPool: Object.fromEntries(Object.entries(byPool).map(([k, v]) => [k, v.length])) };
}
