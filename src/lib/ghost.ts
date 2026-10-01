import "server-only";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { istDate, MULTIPLIERS } from "./game";
import { seenBy } from "./seen";

const { rounds, scores, guesses, players, duels, duelPlayers, duelGuesses } = schema;
const FIVE = MULTIPLIERS.join(",");

/**
 * Ghost Race: an instant head-to-head at any hour against a real player's recorded run of a finished 5-ball round
 * you've never seen (Skillz / Mario Kart ghost style). Picks a run close to your level, copies it into an async duel
 * as the "creator", and you play the same 5 balls through the normal duel flow. Otherwise, why there's no ghost.
 */
export async function createGhostDuel(pid: string): Promise<{ id: string } | { none: "all-seen" | "no-runs" }> {
  const db = await getDb();
  const now = Date.now(), today = istDate();
  const closed = (await db.select({ key: rounds.date, ids: rounds.questionIds, kind: rounds.kind, mults: rounds.mults, closesMs: rounds.closesMs }).from(rounds))
    .filter((r) => r.ids.length === 5 && (r.mults ?? MULTIPLIERS).join(",") === FIVE && (r.kind === "daily" ? r.key < today : (r.closesMs ?? Infinity) < now));
  if (!closed.length) return { none: "no-runs" };
  const seen = await seenBy([pid]);
  const fresh = new Map(closed.filter((r) => !r.ids.some((id) => seen.has(id))).map((r) => [r.key, r]));
  if (!fresh.size) return { none: "all-seen" };

  // Runs by players with a profile, not flagged, not you. Your level: your recent 5-ball totals (500 if none yet).
  const runs = await db.select({ pid: scores.playerId, key: scores.date, total: scores.total }).from(scores).innerJoin(players, eq(players.id, scores.playerId))
    .where(and(inArray(scores.date, [...fresh.keys()]), eq(scores.flagged, false), ne(scores.playerId, pid), isNotNull(players.handle)));
  if (!runs.length) return { none: "no-runs" };
  const mine = (await db.select({ key: scores.date, total: scores.total }).from(scores).where(eq(scores.playerId, pid)).orderBy(desc(scores.createdAt)).limit(30))
    .filter((r) => /^(\d{4}-|evening-)/.test(r.key)).slice(0, 10);
  const level = mine.length ? mine.reduce((t, r) => t + r.total, 0) / mine.length : 500;
  const byLevel = runs.sort((a, b) => Math.abs(a.total - level) - Math.abs(b.total - level));
  const near = [...byLevel.slice(0, 3).sort(() => Math.random() - 0.5), ...byLevel.slice(3)]; // one of the 3 closest first, so repeats vary

  for (const run of near) {
    const gs = await db.select().from(guesses).where(and(eq(guesses.playerId, run.pid), eq(guesses.date, run.key)));
    if (gs.length !== 5) continue;
    const round = fresh.get(run.key)!;
    const id = crypto.randomUUID().slice(0, 8);
    const total = gs.reduce((t, g) => t + g.points * MULTIPLIERS[g.idx], 0);
    await db.insert(duels).values({ id, kind: "async", questionIds: round.ids, createdBy: run.pid, createdAt: now, ghostOf: run.key });
    await db.insert(duelPlayers).values({ duelId: id, playerId: run.pid, total, joinedMs: now - 1 });
    await db.insert(duelGuesses).values(gs.map((g) => ({ duelId: id, playerId: run.pid, idx: g.idx, lat: g.lat, lng: g.lng, points: g.points, km: g.km, atMs: g.createdAt.getTime() })));
    return { id };
  }
  return { none: "no-runs" };
}
