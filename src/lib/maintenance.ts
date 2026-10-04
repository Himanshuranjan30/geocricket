import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ensureDailyCup } from "./cups";
import { addDays, istDate } from "./game";
import { gamesLine, notify, recap } from "./inbox";
import { runJob } from "./jobs";
import { settleLeagues } from "./league";
import { pushEnabled } from "./push";
import { releaseQueued } from "./release";
import { ensureSchedule } from "./schedule";
import { streakFor } from "./server";

/**
 * The day's housekeeping, once per IST day: release new questions, keep a week of games scheduled, make the Daily Cup,
 * settle last week's leagues. Run by the 2 AM cron and, as a fallback, by the first home-screen pulse after midnight
 * if the cron hasn't run, so a missed or failed cron never leaves a day without games.
 */
export const dailyMaintenance = () => runJob(`daily-${istDate()}`, async () => {
  const released = await releaseQueued(100);
  const schedule = await ensureSchedule();
  const dailyCup = await ensureDailyCup(istDate()).catch((e) => String(e));
  const leagues = await settleLeagues();
  if (schedule.short || schedule.runwayDays < 5) console.warn("schedule runway low", schedule);
  return { released, schedule, dailyCup, leagues };
}, { once: true, leaseMs: 4 * 60_000 });

// In-process throttle for the pulse fallback: check the job table at most every 10 minutes per server instance.
let lastCheck = 0;
export function maybeDailyMaintenance() {
  if (Date.now() - lastCheck < 10 * 60_000) return null;
  lastCheck = Date.now();
  return dailyMaintenance();
}

async function subscribers() {
  const db = await getDb();
  return [...new Set((await db.select({ p: schema.pushSubs.playerId }).from(schema.pushSubs)).map((r) => r.p))];
}

/** Players (of `pids`) who finished any game in the last `days` days: evening pushes skip long-lapsed players. */
async function activeSince(pids: string[], days: number) {
  if (!pids.length) return new Set<string>();
  const db = await getDb();
  const since = new Date(Date.now() - days * 864e5);
  return new Set((await db.selectDistinct({ p: schema.scores.playerId }).from(schema.scores)
    .where(and(inArray(schema.scores.playerId, pids), gte(schema.scores.createdAt, since)))).map((r) => r.p));
}

/**
 * Morning push (~8:30 AM IST): yesterday's Daily result (rank, or where a guest would have ranked), else today's games. Each push is
 * the same bell note the app creates on open (same key), so nobody gets it twice and a re-run sends nothing new.
 */
export const morningBrief = () => runJob(`brief-${istDate()}`, async () => {
  if (!pushEnabled()) return { sent: 0, reason: "push not configured" };
  const db = await getDb();
  const today = istDate(), yday = addDays(today, -1);
  const subs = await subscribers();
  const active = await activeSince(subs, 14);
  let sent = 0;
  // ponytail: one leaderboard pass per subscriber; compute the day's board once if subscribers reach the thousands.
  for (const pid of subs) {
    const [p] = await db.select({ userId: schema.players.userId, country: schema.players.country }).from(schema.players).where(eq(schema.players.id, pid));
    if (!p) continue;
    const r = await recap(pid, yday).catch(() => null);
    if (!r && !active.has(pid)) continue; // lapsed players don't get a push every morning
    const note = r ? r.note() : { key: `games-${today}`, kind: "games", title: "🏏 Today's Daily is open", body: gamesLine(p.country), url: "/play?from=push" };
    if (await notify(pid, note, true)) sent++;
  }
  return { sent };
}, { once: true, leaseMs: 4 * 60_000 });

/** Evening push (~6:30 PM IST): a streak about to break (any game saves it), else the Evening Daily going live. Active players only. */
export const eveningPush = () => runJob(`evening-${istDate()}`, async () => {
  if (!pushEnabled()) return { sent: 0, reason: "push not configured" };
  const db = await getDb();
  const today = istDate();
  const subs = await subscribers();
  const active = await activeSince(subs, 14);
  let sent = 0;
  for (const pid of subs) {
    const s = await streakFor(pid);
    if (s.atRisk && s.current >= 2) {
      if (await notify(pid, { key: `streak-${today}`, kind: "streak", title: `🔥 Your ${s.current}-day streak ends at midnight`, body: "The Evening Daily is live: 5 balls, 90 seconds. Any game keeps it alive.", url: "/test/evening-" + today + "?from=push" }, true)) sent++;
      continue;
    }
    if (!active.has(pid)) continue;
    const [done] = await db.select({ d: schema.scores.date }).from(schema.scores).where(and(eq(schema.scores.playerId, pid), eq(schema.scores.date, `evening-${today}`)));
    if (done) continue;
    if (await notify(pid, { key: `evening-${today}`, kind: "games", title: "🌆 The Evening Daily is live", body: "5 new balls. The 10-ball Evening Test drops at 8 PM IST.", url: `/test/evening-${today}?from=push` }, true)) sent++;
  }
  return { sent };
}, { once: true, leaseMs: 4 * 60_000 });
