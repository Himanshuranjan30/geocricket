import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { jobs } = schema;

export type JobRun<T> = { ran: false; reason: "busy" | "done" } | { ran: true; ok: true; result: T } | { ran: true; ok: false; error: string };

/**
 * Run `fn` under a named lease so crons and their fallbacks never overlap (works over Neon's HTTP driver, where
 * session advisory locks don't). `once`: skip if this job name already succeeded (use a dated name, e.g. "daily-<day>").
 * A crashed runner's lease simply expires after `leaseMs`. Every run records a heartbeat for /api/cron/health.
 */
export async function runJob<T>(name: string, fn: () => Promise<T>, { leaseMs = 5 * 60_000, once = false } = {}): Promise<JobRun<T>> {
  const db = await getDb();
  const now = Date.now();
  await db.insert(jobs).values({ name }).onConflictDoNothing();
  const got = await db.update(jobs).set({ leaseUntilMs: now + leaseMs, lastRunMs: now })
    .where(and(eq(jobs.name, name), lt(jobs.leaseUntilMs, now), once ? isNull(jobs.lastOkMs) : undefined)).returning();
  if (!got.length) {
    const [row] = await db.select({ ok: jobs.lastOkMs }).from(jobs).where(eq(jobs.name, name));
    return { ran: false, reason: once && row?.ok ? "done" : "busy" };
  }
  try {
    const result = await fn();
    await db.update(jobs).set({ leaseUntilMs: 0, lastOkMs: Date.now(), lastResult: (result ?? null) as never }).where(eq(jobs.name, name));
    return { ran: true, ok: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(jobs).set({ leaseUntilMs: 0, lastResult: { error } }).where(eq(jobs.name, name)).catch(() => {});
    console.error(`job ${name} failed:`, e);
    return { ran: true, ok: false, error };
  }
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anyone else is turned away. */
export const cronAuthorized = (req: Request) => !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
