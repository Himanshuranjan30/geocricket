import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { addDays, istDate, slotKey, SLOTS } from "@/lib/game";

export const dynamic = "force-dynamic";

// Scheduler health for uptime monitors: 200 when today's and tomorrow's games exist and the daily job ran in the last
// 26 hours, 503 otherwise. Public on purpose; it exposes only job names, times and counts.
export async function GET() {
  const db = await getDb();
  const today = istDate();
  const keys = [today, addDays(today, 1)].flatMap((d) => SLOTS.map((s) => slotKey(d, s.game, s.slot)));
  const have = new Set((await db.select({ k: schema.rounds.date }).from(schema.rounds)).map((r) => r.k));
  const missing = keys.filter((k) => !have.has(k));
  const recent = await db.select({ name: schema.jobs.name, lastRunMs: schema.jobs.lastRunMs, lastOkMs: schema.jobs.lastOkMs, lastResult: schema.jobs.lastResult }).from(schema.jobs).orderBy(desc(schema.jobs.lastRunMs)).limit(20);
  const lastDaily = recent.filter((j) => j.name.startsWith("daily-") && j.lastOkMs).sort((a, b) => b.lastOkMs! - a.lastOkMs!)[0];
  const daily = lastDaily?.lastOkMs ?? 0;
  const schedule = (lastDaily?.lastResult as { schedule?: { daysAhead: number; runwayDays: number; short: boolean } } | null)?.schedule ?? null;
  const ok = !missing.length && Date.now() - daily < 26 * 3600e3 && !schedule?.short;
  return NextResponse.json({ ok, missing, lastDailyOkMs: daily || null, schedule, jobs: recent.map(({ lastResult, ...j }) => ({ ...j, failed: !!(lastResult as { error?: string } | null)?.error })) }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
