import "server-only";
import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dayEndMs, dayStartMs, istDate, MULTIPLIERS, periodRange, type Period } from "./game";
import { currentWeek } from "./league";
import { leagueName } from "./leagueRules";
import { accuracyOf, rankingOf, windowStart, WINDOW_DAYS, type RankedGame } from "./rankingRules";
import { istDayOf, streakOf } from "./streak";

const { scores, rounds, players, guesses, owned, leagueMembers, duels, duelPlayers } = schema;

// Leaderboards that show a player's real value, each measuring one thing honestly (lib/rankingRules.ts):
//   ranking  GeoCricket Ranking: form across every scored game × consistency (the headline)
//   points   total points in all of the day's scored games, for today / this week / this month
//   accuracy average points per ball over the last 30 days (25-ball minimum)
//   streak   current daily streak (any game counts; freezes and saves apply)
//   effort   league XP earned this week in any mode
//   h2h      Elo from rated live 1v1s and cups (3-match minimum)
// Fair play: signed-in players only, and anyone with a flagged (suspicious) game in the last 30 days sits out every
// board. They still see their own row, so a cheater can't tell. Countries rank by their players' average Ranking.
export const BOARDS = ["ranking", "points", "accuracy", "streak", "effort", "h2h", "countries"] as const;
export type BoardId = (typeof BOARDS)[number];

type Entry = { pid: string; value: number; sub: string; provisional?: boolean; tie?: number };
export type BoardRow = { rank: number; handle: string; avatar: string; country: string | null; value: number; sub: string; provisional: boolean; me: boolean };

type Who = { handle: string | null; avatar: string | null; country: string | null; userId: string | null; rating: number; tier: number };
async function people(pids: string[]) {
  if (!pids.length) return new Map<string, Who>();
  const db = await getDb();
  const rows = await db.select({ id: players.id, handle: players.handle, avatar: players.avatar, country: players.country, userId: players.userId, rating: players.rating, tier: players.leagueTier })
    .from(players).where(inArray(players.id, pids));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Players who can't be ranked right now: a flagged game in the last 30 days. */
async function sittingOut() {
  const db = await getDb();
  const rows = await db.selectDistinct({ p: scores.playerId }).from(scores).where(and(eq(scores.flagged, true), gte(scores.createdAt, new Date(Date.now() - 30 * 864e5))));
  return new Set(rows.map((r) => r.p));
}

/** Every scored game in the last 90 days as a share of its round's maximum, per player. */
async function recentGames() {
  const db = await getDb();
  const rows = await db.select({ pid: scores.playerId, total: scores.total, at: scores.createdAt, flagged: scores.flagged, mults: rounds.mults, ids: rounds.questionIds })
    .from(scores).innerJoin(rounds, eq(rounds.date, scores.date)).where(gte(scores.createdAt, new Date(dayStartMs(windowStart(istDate(), WINDOW_DAYS)))));
  const by = new Map<string, RankedGame[]>();
  for (const r of rows) {
    if (r.flagged) continue;
    const mults = r.mults ?? r.ids.map((_, i) => MULTIPLIERS[i] ?? 1);
    const max = mults.reduce((s, m) => s + 100 * m, 0) || 1;
    (by.get(r.pid) ?? by.set(r.pid, []).get(r.pid)!).push({ day: istDayOf(r.at.getTime()), pct: r.total / max, balls: mults.length });
  }
  return by;
}

async function entries(board: Exclude<BoardId, "countries">, period: Period): Promise<Entry[]> {
  const db = await getDb();
  const today = istDate();
  if (board === "ranking") {
    return [...(await recentGames())].flatMap(([pid, games]) => {
      const r = rankingOf(games, today);
      return r ? [{ pid, value: r.points, provisional: r.provisional, sub: `form ${r.form} · consistency ${r.consistency}% · ${r.games} game${r.games === 1 ? "" : "s"}` }] : [];
    });
  }
  if (board === "points") {
    const [start, end] = periodRange(today, period);
    const rows = await db.select({ pid: scores.playerId, total: scores.total, at: scores.createdAt, flagged: scores.flagged }).from(scores)
      .where(and(gte(scores.createdAt, new Date(dayStartMs(start))), sql`${scores.createdAt} <= ${new Date(dayEndMs(end))}`));
    const by = new Map<string, { total: number; games: number; first: number }>();
    for (const r of rows) {
      if (r.flagged) continue;
      const e = by.get(r.pid) ?? { total: 0, games: 0, first: Infinity };
      e.total += r.total; e.games++; e.first = Math.min(e.first, r.at.getTime()); by.set(r.pid, e);
    }
    return [...by].map(([pid, e]) => ({ pid, value: e.total, tie: e.first, sub: `${e.games} game${e.games === 1 ? "" : "s"}` }));
  }
  if (board === "accuracy") {
    const rows = await db.select({ pid: guesses.playerId, points: guesses.points }).from(guesses).where(gte(guesses.createdAt, new Date(Date.now() - 30 * 864e5)));
    const by = new Map<string, number[]>();
    for (const r of rows) (by.get(r.pid) ?? by.set(r.pid, []).get(r.pid)!).push(r.points);
    return [...by].flatMap(([pid, pts]) => {
      const a = accuracyOf(pts);
      return a == null ? [] : [{ pid, value: a, sub: `${pts.length} balls · ${pts.filter((p) => p >= 90).length} scored 90+` }];
    });
  }
  if (board === "streak") {
    // ponytail: reads every score; fine until scores reach the millions, then keep a per-player streak column.
    const [rows, saves] = await Promise.all([
      db.select({ pid: scores.playerId, at: scores.createdAt }).from(scores),
      db.select({ pid: owned.playerId, item: owned.itemId }).from(owned).where(like(owned.itemId, "save:%")),
    ]);
    const days = new Map<string, Set<string>>(), saved = new Map<string, string[]>();
    for (const r of rows) (days.get(r.pid) ?? days.set(r.pid, new Set()).get(r.pid)!).add(istDayOf(r.at.getTime()));
    for (const s of saves) (saved.get(s.pid) ?? saved.set(s.pid, []).get(s.pid)!).push(s.item.slice(5));
    return [...days].flatMap(([pid, d]) => {
      const s = streakOf(d, today, saved.get(pid) ?? []);
      return s.current ? [{ pid, value: s.current, tie: -s.best, sub: `best ${s.best}${s.atRisk ? " · play today" : ""}` }] : [];
    });
  }
  if (board === "effort") {
    const rows = await db.select({ pid: leagueMembers.playerId, xp: leagueMembers.xp, tier: leagueMembers.tier, at: leagueMembers.updatedMs }).from(leagueMembers).where(eq(leagueMembers.week, currentWeek()));
    return rows.filter((r) => r.xp > 0).map((r) => ({ pid: r.pid, value: r.xp, tie: r.at, sub: leagueName(r.tier) }));
  }
  // h2h: rated matches finished (live 1v1s and cups)
  const rows = await db.select({ pid: duelPlayers.playerId, n: sql<number>`count(*)::int` }).from(duelPlayers).innerJoin(duels, eq(duels.id, duelPlayers.duelId))
    .where(and(inArray(duels.kind, ["live", "cup"]), eq(duels.status, "done"))).groupBy(duelPlayers.playerId);
  const who = await people(rows.map((r) => r.pid));
  return rows.filter((r) => r.n >= 3).map((r) => ({ pid: r.pid, value: who.get(r.pid)?.rating ?? 1200, sub: `${r.n} rated matches` }));
}

// Established players first (provisional rankings after), then value, then the tie-break.
const order = (a: Entry, b: Entry) => Number(!!a.provisional) - Number(!!b.provisional) || b.value - a.value || (a.tie ?? 0) - (b.tie ?? 0);

// ponytail: each board is computed in memory and cached per server instance for 60 s; move to SQL rollups at ~100K players.
const cache = new Map<string, { at: number; data: Promise<Awaited<ReturnType<typeof compute>>> }>();
async function compute(board: Exclude<BoardId, "countries">, period: Period) {
  const [list, out] = await Promise.all([entries(board, period), sittingOut()]);
  const who = await people(list.map((e) => e.pid));
  return { list: list.sort(order), who, out };
}
function computed(board: Exclude<BoardId, "countries">, period: Period) {
  const key = `${board}:${period}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = compute(board, period);
  cache.set(key, { at: Date.now(), data });
  data.catch(() => cache.delete(key));
  return data;
}

const row = (e: Entry, rank: number, w: Who | undefined, me: boolean): BoardRow => ({
  rank, handle: w?.handle ?? "player", avatar: w?.avatar ?? "anon", country: w?.country ?? null, value: e.value, sub: e.sub, provisional: !!e.provisional, me,
});

/** One board: the top `limit`, the viewer's own row (where they'd be, for guests and players sitting out) and the field size. */
export async function board(id: BoardId, me: string | null, { period = "day" as Period, limit = 10 } = {}) {
  if (id === "countries") return countries(me, limit);
  const { list, who, out } = await computed(id, period);
  const eligible = list.filter((e) => who.get(e.pid)?.userId && who.get(e.pid)?.handle && !out.has(e.pid));
  const mine = list.find((e) => e.pid === me);
  const myRank = mine ? eligible.filter((e) => order(e, mine) < 0 && e.pid !== me).length + 1 : null;
  const ranked = !!mine && eligible.includes(mine);
  return {
    board: id, period, count: eligible.length,
    top: eligible.slice(0, limit).map((e, i) => row(e, i + 1, who.get(e.pid), e.pid === me)),
    me: mine ? { ...row(mine, myRank!, who.get(mine.pid), true), ranked, guest: !who.get(mine.pid)?.userId } : null,
  };
}

async function countries(me: string | null, limit: number) {
  const { list, who, out } = await computed("ranking", "day");
  // Every ranked player counts (provisional ones too, or early on no country would show); a country whose players are
  // all still provisional is marked P, like a provisional player.
  const by = new Map<string, { sum: number; n: number; established: number }>();
  for (const e of list) {
    const w = who.get(e.pid);
    if (!w?.userId || !w.country || out.has(e.pid)) continue;
    const c = by.get(w.country) ?? { sum: 0, n: 0, established: 0 }; c.sum += e.value; c.n++; if (!e.provisional) c.established++; by.set(w.country, c);
  }
  const mine = me ? (await people([me])).get(me)?.country ?? null : null;
  const rows = [...by].map(([country, c]) => ({ country, value: Math.round(c.sum / c.n), n: c.n, provisional: !c.established })).sort((a, b) => b.value - a.value || b.n - a.n);
  return {
    board: "countries" as const, period: "day" as Period, count: rows.length,
    top: rows.slice(0, limit).map((c, i) => ({ rank: i + 1, handle: c.country, avatar: "", country: c.country, value: c.value, sub: `${c.n} ranked player${c.n === 1 ? "" : "s"}`, provisional: c.provisional, me: c.country === mine })),
    me: null,
  };
}

/** The viewer's standing on every board at once: the "your value" card. */
export async function mySummary(me: string) {
  const ids = ["ranking", "points", "accuracy", "streak", "effort", "h2h"] as const;
  const all = await Promise.all(ids.map((id) => board(id, me, { limit: 0 })));
  return Object.fromEntries(ids.map((id, i) => [id, all[i].me ? { value: all[i].me!.value, rank: all[i].me!.rank, of: all[i].count, ranked: all[i].me!.ranked, provisional: all[i].me!.provisional, sub: all[i].me!.sub } : null]));
}

