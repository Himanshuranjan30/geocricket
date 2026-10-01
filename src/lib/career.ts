import "server-only";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { tierOfTrack, TRACKS, type TrackId } from "./badges";
import { istDate } from "./game";
import { istDayOf, streakOf } from "./streak";
import { levelOf, nextTitle, titleFor } from "./level";
import { savedDays } from "./server";

const { cups, players, scores, guesses, seen, owned, notifications, duelPlayers, duels, duelGuesses } = schema;

/**
 * A player's career: XP, level, title, stats and badge tracks.
 * Fair-play gating: flagged (suspicious) scores never count; perfects only from scored rounds (Dailies/Test Matches,
 * not unlimited Nets); duel wins need the rival to finish all 5 balls and count at most 3 per rival; top-10 / podium
 * days only count when 25+ players were ranked (see inbox.ts). Guests see progress but earn nothing until signed in.
 */
export async function careerFor(pid: string, signedIn: boolean) {
  const db = await getDb();
  const [p] = await db.select({ xp: players.xp }).from(players).where(eq(players.id, pid));
  const all = await db.select({ d: scores.date, total: scores.total, at: scores.createdAt }).from(scores).where(and(eq(scores.playerId, pid), eq(scores.flagged, false)));
  const daily = all.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.d));
  const days = [...new Set(daily.map((r) => r.d))].sort();
  // Longest streak, by the same rule as the live one (any scored game counts, weekly freeze): lib/streak.ts.
  const streak = streakOf(all.map((r) => istDayOf(r.at.getTime())), istDate(), await savedDays(pid)).best;
  const fair = new Set(all.map((r) => r.d));
  const perf = await db.select({ d: guesses.date }).from(guesses).where(and(eq(guesses.playerId, pid), eq(guesses.points, 100)));
  const [{ nets }] = await db.select({ nets: sql<number>`count(*)::int` }).from(seen).where(and(eq(seen.playerId, pid), eq(seen.mode, "nets")));
  const [{ legends }] = await db.select({ legends: sql<number>`count(*)::int` }).from(owned).where(and(eq(owned.playerId, pid), like(owned.itemId, "legend:%")));
  const ranks = (await db.select({ t: notifications.title }).from(notifications).where(and(eq(notifications.playerId, pid), like(notifications.key, "rank-%"))))
    .map((r) => Number(r.t.match(/#(\d+)/)?.[1] ?? 99));

  const mine = await db.select({ id: duelPlayers.duelId, total: duelPlayers.total }).from(duelPlayers).innerJoin(duels, eq(duels.id, duelPlayers.duelId))
    .where(and(eq(duelPlayers.playerId, pid), eq(duels.kind, "async")));
  const perRival = new Map<string, number>();
  for (const m of mine) {
    const others = await db.select({ p: duelPlayers.playerId, total: duelPlayers.total }).from(duelPlayers).where(and(eq(duelPlayers.duelId, m.id), sql`${duelPlayers.playerId} <> ${pid}`));
    for (const o of others) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(duelGuesses).where(and(eq(duelGuesses.duelId, m.id), eq(duelGuesses.playerId, o.p)));
      if (n >= 5 && m.total > o.total) perRival.set(o.p, Math.min(3, (perRival.get(o.p) ?? 0) + 1));
    }
  }

  // Cups: same thresholds as the cup leaderboard, so guest-filled or tiny cups don't count.
  const [{ cupWins }] = await db.select({ cupWins: sql<number>`count(*)::int` }).from(cups).where(and(eq(cups.status, "done"), eq(cups.winnerId, pid), gte(cups.signedIn, 4)));
  const [{ cupHosts }] = await db.select({ cupHosts: sql<number>`count(*)::int` }).from(cups).where(and(eq(cups.status, "done"), eq(cups.hostId, pid), gte(cups.signedIn, 8)));

  const lv = levelOf(p?.xp ?? 0);
  const stats: Record<TrackId, number> = {
    dailies: days.length, streak, perfects: perf.filter((g) => fair.has(g.d)).length, best: Math.max(0, ...daily.map((r) => r.total)),
    tests: all.filter((r) => r.d.startsWith("test-")).length, nets, duels: [...perRival.values()].reduce((a, b) => a + b, 0),
    top10: ranks.filter((r) => r <= 10).length, podium: ranks.filter((r) => r <= 3).length, legends, level: lv.level, cupWins, cupHosts,
  };
  const badges = TRACKS.map((t) => {
    const s = tierOfTrack(t.tiers, stats[t.id]);
    return { id: t.id, icon: t.icon, name: t.name, desc: t.desc, tiers: t.tiers, value: stats[t.id], ...s, tier: signedIn ? s.tier : -1 };
  });
  return { ...lv, title: titleFor(lv.level), next: nextTitle(lv.level), stats, badges, signedIn };
}
