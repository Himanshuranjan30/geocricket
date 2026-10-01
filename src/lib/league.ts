import "server-only";
import { and, asc, count, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, dayEndMs, istDate, weekOf } from "./game";
import { runJob } from "./jobs";
import { byStanding, COHORT_SIZE, leagueName, settleCohort, zones } from "./leagueRules";

const { leagueMembers, players } = schema;
export const currentWeek = () => weekOf(istDate());

/** The first cohort of a tier with a free seat this week, or a new one. */
async function openCohort(week: string, tier: number) {
  const db = await getDb();
  const rows = await db.select({ cohort: leagueMembers.cohort, n: count() }).from(leagueMembers)
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, tier))).groupBy(leagueMembers.cohort).orderBy(asc(leagueMembers.cohort));
  // ponytail: two players joining the last seat at the same moment can make a cohort of 31; harmless for standings.
  return rows.find((r) => r.n < COHORT_SIZE)?.cohort ?? (rows.length ? rows[rows.length - 1].cohort + 1 : 0);
}

/** Add (or, for a Test Match penalty, take) league XP this week. Signed-in players only; called from addXp. */
export async function addLeagueXp(pid: string, delta: number) {
  delta = Math.round(delta);
  if (!delta) return;
  const db = await getDb();
  const week = currentWeek(), now = Date.now();
  const bumped = await db.update(leagueMembers).set({ xp: sql`greatest(0, ${leagueMembers.xp} + ${delta})`, updatedMs: now })
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.playerId, pid))).returning();
  if (bumped.length || delta < 0) return;
  // First XP of the week: settle last week first (normally done by the nightly job) so the player joins their new tier.
  await settleLeagues();
  const [p] = await db.select({ tier: players.leagueTier }).from(players).where(eq(players.id, pid));
  const tier = p?.tier ?? 0;
  await db.insert(leagueMembers).values({ week, playerId: pid, tier, cohort: await openCohort(week, tier), xp: delta, updatedMs: now })
    .onConflictDoUpdate({ target: [leagueMembers.week, leagueMembers.playerId], set: { xp: sql`${leagueMembers.xp} + ${delta}`, updatedMs: now } });
}

/** Settle every finished week that still has unsettled players. Idempotent; each week runs under its own lease. */
export async function settleLeagues() {
  const db = await getDb();
  const weeks = (await db.selectDistinct({ week: leagueMembers.week }).from(leagueMembers)
    .where(and(isNull(leagueMembers.outcome), lt(leagueMembers.week, currentWeek())))).map((r) => r.week).sort();
  const out: Record<string, unknown> = {};
  for (const week of weeks) out[week] = await runJob(`league-${week}`, () => settleWeek(week), { leaseMs: 2 * 60_000 });
  return out;
}

async function settleWeek(week: string) {
  const db = await getDb();
  const rows = await db.select().from(leagueMembers).where(eq(leagueMembers.week, week));
  const cohorts = new Map<string, typeof rows>();
  for (const r of rows) { const k = `${r.tier}:${r.cohort}`; (cohorts.get(k) ?? cohorts.set(k, []).get(k)!).push(r); }
  const { notify } = await import("./inbox");
  let up = 0, down = 0;
  for (const members of cohorts.values()) {
    for (const r of settleCohort(members)) {
      // Absolute writes (rank, outcome, next tier), so a re-run after a crash lands in the same place.
      await db.update(leagueMembers).set({ rank: r.rank, outcome: r.outcome }).where(and(eq(leagueMembers.week, week), eq(leagueMembers.playerId, r.playerId)));
      await db.update(players).set({ leagueTier: r.tier }).where(eq(players.id, r.playerId));
      if (r.outcome === "up") up++; else if (r.outcome === "down") down++;
      const title = r.outcome === "up" ? `⬆️ Promoted to the ${leagueName(r.tier)}` : r.outcome === "down" ? `⬇️ Down to the ${leagueName(r.tier)}` : `🏅 You finished #${r.rank} in the ${leagueName(r.tier)}`;
      await notify(r.playerId, { key: `league-${week}`, kind: "league", title, body: "A new league week has started. Every ball earns XP.", url: "/league" }, true).catch(() => {});
    }
  }
  return { players: rows.length, cohorts: cohorts.size, up, down };
}

/** This week's standings for a player's cohort, plus how last week ended. */
export async function leagueFor(pid: string) {
  const db = await getDb();
  const week = currentWeek();
  const [p] = await db.select({ tier: players.leagueTier }).from(players).where(eq(players.id, pid));
  const [mine] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.week, week), eq(leagueMembers.playerId, pid)));
  const [last] = await db.select({ rank: leagueMembers.rank, outcome: leagueMembers.outcome, tier: leagueMembers.tier }).from(leagueMembers)
    .where(and(eq(leagueMembers.week, addDays(week, -7)), eq(leagueMembers.playerId, pid)));
  const tier = mine?.tier ?? p?.tier ?? 0;
  const base = { week, endsMs: dayEndMs(addDays(week, 6)), tier, name: leagueName(tier), last: last?.outcome ? last : null };
  if (!mine) return { ...base, joined: false as const, members: [], zones: zones(0, tier) };
  const rows = await db.select({ playerId: leagueMembers.playerId, xp: leagueMembers.xp, updatedMs: leagueMembers.updatedMs, tier: leagueMembers.tier, handle: players.handle, avatar: players.avatar, country: players.country })
    .from(leagueMembers).leftJoin(players, eq(players.id, leagueMembers.playerId))
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, mine.tier), eq(leagueMembers.cohort, mine.cohort)));
  const members = rows.sort(byStanding).map((r, i) => ({ rank: i + 1, handle: r.handle ?? "player", avatar: r.avatar ?? "anon", country: r.country, xp: r.xp, me: r.playerId === pid }));
  return { ...base, joined: true as const, members, zones: zones(members.length, tier) };
}
