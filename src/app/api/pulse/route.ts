import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { tickDueCups } from "@/lib/cups";
import { maybeDailyMaintenance } from "@/lib/maintenance";
import { getDb, schema } from "@/db";
import { dayStartMs, istDate } from "@/lib/game";

export const dynamic = "force-dynamic";

const ONLINE_MS = 10 * 60_000;
// db.execute returns { rows } on PGlite and Neon's HTTP driver alike; numbers can arrive as strings.
const rowsOf = (r: unknown) => ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[])).map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Number(v)]))) as { n: number; today: number }[];

// Home-screen pulse: players active in the last 10 minutes and the latest finished live duel. No player ids leave here.
// Edge-cached for 20 s (same for everyone), so the cup ticks and daily fallback below run on cache misses: every ~20 s at most.
export async function GET() {
  // Every home screen polls this every 30 s, so it doubles as the cups scheduler (Vercel Hobby has no per-minute cron):
  // check-in reminders, starts and walkovers happen even when nobody has the cup open.
  after(() => tickDueCups().catch(() => {}));
  // ...and as the fallback for the nightly job: if the 2 AM cron hasn't run today, the first visitor's pulse runs it.
  after(() => maybeDailyMaintenance()?.catch(() => {}));
  const db = await getDb();
  const { seen, players, duels, duelPlayers } = schema;
  const since = Date.now() - ONLINE_MS;
  const [[{ n }], [{ today }], recentIds, [last]] = await Promise.all([
    // Anyone playing anything: pin-game balls (seen), Mystery Cricketer and challenge guesses, Name Race buzzes.
    db.execute(sql`select count(distinct p)::int as n from (select player_id p from seen where at_ms > ${since} union select player_id from who_guesses where at_ms > ${since} union select player_id from who_buzzes where at_ms > ${since}) a`).then(rowsOf),
    db.execute(sql`select count(distinct p)::int as today from (select player_id p from seen where at_ms > ${dayStartMs(istDate())} union select player_id from who_guesses where at_ms > ${dayStartMs(istDate())} union select player_id from who_buzzes where at_ms > ${dayStartMs(istDate())}) a`).then(rowsOf),
    db.selectDistinct({ id: seen.playerId, at: seen.atMs }).from(seen).where(gt(seen.atMs, since)).orderBy(desc(seen.atMs)).limit(12),
    db.select({ id: duels.id, state: duels.state }).from(duels).where(and(eq(duels.kind, "live"), eq(duels.status, "done"))).orderBy(desc(duels.createdAt)).limit(1),
  ]);
  const ids = [...new Set(recentIds.map((r) => r.id))].slice(0, 3);
  const faces = ids.length ? (await db.select({ avatar: players.avatar }).from(players).where(inArray(players.id, ids))).map((p) => p.avatar) : [];

  let recent = null;
  if (last?.state) {
    const roster = await db.select({ pid: duelPlayers.playerId, handle: players.handle, avatar: players.avatar, country: players.country })
      .from(duelPlayers).innerJoin(players, eq(players.id, duelPlayers.playerId)).where(eq(duelPlayers.duelId, last.id));
    const pids = Object.keys(last.state.hp);
    const bySlot = pids.map((pid) => roster.find((r) => r.pid === pid));
    if (bySlot.every(Boolean)) {
      recent = {
        players: bySlot.map((r) => ({ handle: r!.handle, avatar: r!.avatar, country: r!.country })),
        winner: last.state.winner ? pids.indexOf(last.state.winner) : null, // -1 = draw
      };
    }
  }
  return NextResponse.json({ online: n, today, faces, recent }, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=40" } });
}
