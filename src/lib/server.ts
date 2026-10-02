import "server-only";
import { and, count, desc, eq, gte, inArray, like, lte, sql, notLike } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getAuth } from "./auth";
import { getDb, schema } from "@/db";
import { xpAfter } from "./level";
import { dailyOpen, isSuspicious, MULTIPLIERS, istDate, periodRange, type Period } from "./game";
import { istDayOf, streakOf } from "./streak";

const { questions, rounds, players, scores } = schema;
const COOKIE = "pm_pid";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 730, path: "/" };

export async function sessionUser() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * The current player's id.
 * Signed in: the player linked to the Google account (a guest player is linked on first sign-in).
 * Guest: the id in the pm_pid cookie, ignoring any player that belongs to an account (after sign-out).
 * `create` may write the cookie, so only pass it from route handlers.
 */
export async function playerId(create = false) {
  const db = await getDb();
  const jar = await cookies();
  const cookieId = jar.get(COOKIE)?.value;
  const user = await sessionUser();

  if (user) {
    const [linked] = await db.select({ id: players.id }).from(players).where(eq(players.userId, user.id));
    let id = linked?.id;
    // Signing in on a device where they played as a guest, to an account that already has a player (another device):
    // the guest's progress moves into the account, once (the guest player is removed), and the cookie switches over.
    if (id && cookieId && cookieId !== id) {
      const [guest] = await db.select({ userId: players.userId }).from(players).where(eq(players.id, cookieId));
      if (guest && !guest.userId) {
        await mergeGuest(cookieId, id).catch((e) => console.error("guest merge", e));
        try { jar.set(COOKIE, id, cookieOpts); jar.set("pm_merged", "1", { ...cookieOpts, maxAge: 120 }); } catch { /* read-only context (server component): the next API call switches it */ }
      }
    }
    if (!id && cookieId) {
      // First sign-in on this device: the guest player (profile, scores, streak) joins the account.
      const [guest] = await db.select({ id: players.id, userId: players.userId }).from(players).where(eq(players.id, cookieId));
      if (guest && !guest.userId) { await db.update(players).set({ userId: user.id }).where(eq(players.id, guest.id)); id = guest.id; }
    }
    if (!id && create) { id = crypto.randomUUID(); await db.insert(players).values({ id, userId: user.id }); }
    if (id && create && id !== cookieId) jar.set(COOKIE, id, cookieOpts);
    return id ?? null;
  }

  if (cookieId) {
    const [p] = await db.select({ userId: players.userId }).from(players).where(eq(players.id, cookieId));
    if (p && !p.userId) return cookieId;
    if (!p && create) { await db.insert(players).values({ id: cookieId }).onConflictDoNothing(); return cookieId; }
  }
  if (!create) return null;
  const id = crypto.randomUUID();
  await db.insert(players).values({ id });
  jar.set(COOKIE, id, cookieOpts);
  return id;
}

// Every table holding a player's data, with the columns that make a row unique for them. A guest row moves into the
// account unless the account already has that row; for per-day games the whole day moves or none of it (never a mix).
const PER_PLAYER: [table: string, key: string[]][] = [
  ["checks", ["question_id"]], ["seen", ["question_id"]], ["owned", ["item_id"]], ["cup_entrants", ["cup_id"]], ["cup_waitlist", ["cup_id"]],
  ["duel_players", ["duel_id"]], ["duel_guesses", ["duel_id", "idx"]], ["who_buzzes", ["duel_id", "round", "clue"]], ["group_members", ["group_id"]],
  ["league_members", ["week"]], ["feedback", []], ["notifications", []], ["orders", []], ["push_subs", []],
];
const PER_DAY: [days: string, tables: string[]][] = [["scores", ["guesses", "starts", "scores"]], ["who_results", ["who_guesses", "who_results"]]];

/** Move a guest player's progress into a signed-in account's player, then delete the guest. Safe to re-run. */
export async function mergeGuest(from: string, into: string) {
  const db = await getDb();
  const run = (q: string) => db.execute(sql.raw(q));
  const f = `'${from.replace(/'/g, "")}'`, t = `'${into.replace(/'/g, "")}'`; // ids are server-made UUIDs; quoted defensively
  for (const [days, tables] of PER_DAY) {
    // A day (daily date, challenge "c:<slug>", edition key…) the account already has stays the account's. The list is
    // taken before anything moves: moving one table first would make the guest's days look like the account's.
    const had = await run(`select date from ${days} where player_id = ${t} union select date from ${tables[0]} where player_id = ${t}`);
    const rows = ((had as unknown as { rows?: { date: string }[] }).rows ?? (had as unknown as { date: string }[])) as { date: string }[];
    const keep = rows.length ? `and date not in (${rows.map((r) => `'${String(r.date).replace(/'/g, "''")}'`).join(",")})` : "";
    for (const tb of tables) {
      await run(`update ${tb} set player_id = ${t} where player_id = ${f} ${keep}`);
      await run(`delete from ${tb} where player_id = ${f}`);
    }
  }
  for (const [tb, key] of PER_PLAYER) {
    const clash = key.length ? `and not exists (select 1 from ${tb} x where x.player_id = ${t} and ${key.map((k) => `x.${k} = ${tb}.${k}`).join(" and ")})` : "";
    await run(`update ${tb} set player_id = ${t} where player_id = ${f} ${clash}`);
    await run(`delete from ${tb} where player_id = ${f}`);
  }
  await run(`update duels set created_by = ${t} where created_by = ${f}`);
  await run(`update groups set created_by = ${t} where created_by = ${f}`);
  await run(`update cups set winner_id = ${t} where winner_id = ${f}`);
  await run(`update who_challenges set host_player_id = ${t} where host_player_id = ${f}`);
  // XP adds up; the account keeps its own profile, rating and age confirmation unless it never had one.
  const [g] = await db.select().from(players).where(eq(players.id, from));
  if (g) {
    const [a] = await db.select().from(players).where(eq(players.id, into));
    await db.update(players).set({
      xp: sql`${players.xp} + ${g.xp}`,
      ...(!a?.handle && g.handle ? { handle: g.handle, avatar: g.avatar, country: g.country } : {}),
      ...(!a?.ageConfirmedMs && g.ageConfirmedMs ? { ageConfirmedMs: g.ageConfirmedMs } : {}),
    }).where(eq(players.id, into));
    await db.delete(players).where(eq(players.id, from));
  }
}

export type Answer = { id: string; name: string; when: string; story: string; lat: number; lng: number; source: string };
export const toAnswer = (q: typeof questions.$inferSelect): Answer => ({
  id: q.id, name: q.answer, when: q.when, story: q.story, lat: q.lat, lng: q.lng, source: q.source,
});

/** A daily (key = YYYY-MM-DD) or an edition (key = "match-…" / "test-…") with its questions and multipliers. */
export async function getRound(key: string) {
  const db = await getDb();
  const [round] = await db.select().from(rounds).where(eq(rounds.date, key));
  if (!round) return null;
  const qs = await db.select().from(questions).where(inArray(questions.id, round.questionIds));
  const byId = new Map(qs.map((q) => [q.id, q]));
  const mults = round.mults ?? MULTIPLIERS;
  let number: number | null = null;
  if (round.kind === "daily") {
    const [{ n }] = await db.select({ n: count() }).from(rounds).where(and(eq(rounds.kind, "daily"), lte(rounds.date, key)));
    number = n;
  }
  return {
    date: key, kind: round.kind, title: round.title, number, opensMs: round.opensMs, closesMs: round.closesMs,
    questions: round.questionIds.map((id, i) => ({ ...byId.get(id)!, mult: mults[i] ?? 1 })),
  };
}
export type RoundData = NonNullable<Awaited<ReturnType<typeof getRound>>>;

/** Can this round be played for a score right now? Today's daily, or an edition inside its window. */
export function isLive(r: Pick<RoundData, "kind" | "date" | "opensMs" | "closesMs">, now = Date.now()) {
  if (r.kind === "daily") return dailyOpen(r.date, now);
  return (r.opensMs ?? 0) <= now && now <= (r.closesMs ?? 0);
}

/** Write a finished round's score (idempotent: first write wins). Called by the last guess and, as a safety net, by
 * /api/round when every ball is answered but the score is missing (a failed final request). */
export async function finalizeScore(pid: string, round: RoundData, mine: { idx: number; points: number; km: number; ms: number }[]) {
  const n = round.questions.length;
  if (mine.length !== n) return;
  const db = await getDb();
  const total = mine.reduce((s, g) => s + g.points * round.questions[g.idx].mult, 0);
  const totalMs = mine.reduce((s, g) => s + g.ms, 0);
  const max = round.questions.reduce((s, x) => s + 100 * x.mult, 0);
  await db.insert(scores).values({
    playerId: pid, date: round.date, total, kmTotal: mine.reduce((s, g) => s + g.km, 0), ms: totalMs, flagged: isSuspicious(total, totalMs, max, n),
  }).onConflictDoNothing();
}

/** Is this round over (a past Daily, or an edition past its window)? Only finished rounds go in the archive. */
export const isClosed = (r: Pick<RoundData, "kind" | "date" | "closesMs">, now = Date.now()) =>
  r.kind === "daily" ? r.date < istDate(new Date(now)) : (r.closesMs ?? Infinity) < now;

/**
 * Questions whose answers are safe to show anywhere (Moments pages, archive/Nets checks, friend duels on chosen balls):
 * balls from finished rounds, plus the Nets pool. Everything else may still be scheduled into a scored game (the
 * edition pool) or a rated live 1v1 (the Versus pool), so its answer stays off the public site.
 */
export async function openIds() {
  const db = await getDb();
  const now = Date.now();
  const [rows, nets] = await Promise.all([
    db.select({ ids: rounds.questionIds, kind: rounds.kind, date: rounds.date, closesMs: rounds.closesMs }).from(rounds),
    db.select({ id: questions.id }).from(questions).where(and(eq(questions.pool, "nets"), eq(questions.status, "live"))),
  ]);
  const closed = rows.filter((r) => isClosed(r, now));
  const hidden = new Set(rows.filter((r) => !isClosed(r, now)).flatMap((r) => r.ids)); // a ball in an open or upcoming round stays secret
  return new Set([...closed.flatMap((r) => r.ids), ...nets.map((q) => q.id)].filter((id) => !hidden.has(id)));
}

/** Questions that must stay secret: today's and future dailies, and editions that are open or upcoming. */
export async function hiddenIds() {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.select({ ids: rounds.questionIds, kind: rounds.kind, date: rounds.date, closesMs: rounds.closesMs }).from(rounds);
  const today = istDate();
  return new Set(rows.filter((r) => (r.kind === "daily" ? r.date >= today : (r.closesMs ?? 0) > now)).flatMap((r) => r.ids));
}

export async function pastDates() {
  const db = await getDb();
  const rows = await db.select({ date: rounds.date }).from(rounds).where(eq(rounds.kind, "daily")).orderBy(desc(rounds.date));
  const today = istDate();
  return rows.map((r) => r.date).filter((d) => d < today);
}

/** Every closed round (past Dailies, Evening Dailies, Test Matches, Match Days), newest first, for the archive. */
export async function pastRounds() {
  const db = await getDb();
  const now = Date.now(), today = istDate();
  const rows = await db.select({ key: rounds.date, kind: rounds.kind, title: rounds.title, ids: rounds.questionIds, closesMs: rounds.closesMs }).from(rounds);
  const plays = new Map((await db.select({ key: scores.date, n: count() }).from(scores).groupBy(scores.date)).map((r) => [r.key, r.n]));
  const closed = rows.filter((r) => (r.kind === "daily" ? r.key < today : (r.closesMs ?? Infinity) < now));
  const dailies = closed.filter((r) => r.kind === "daily").map((r) => r.key).sort();
  return closed
    .map((r) => ({ key: r.key, kind: r.kind, title: r.title, balls: r.ids.length, players: plays.get(r.key) ?? 0, number: r.kind === "daily" ? dailies.indexOf(r.key) + 1 : null,
      day: r.kind === "daily" ? r.key : r.key.match(/\d{4}-\d{2}-\d{2}$/)?.[0] ?? (r.closesMs ? istDayOf(r.closesMs) : ""), closesMs: r.closesMs }))
    .sort((a, b) => b.day.localeCompare(a.day) || (b.closesMs ?? 0) - (a.closesMs ?? 0));
}

/** Where a total would have ranked among the signed-in players who played a round live (archive replays). */
export async function wouldRank(key: string, total: number) {
  const db = await getDb();
  const rows = await db.select({ total: scores.total }).from(scores).leftJoin(players, eq(players.id, scores.playerId))
    .where(and(eq(scores.date, key), eq(scores.flagged, false), sql`${players.userId} is not null`));
  const count = rows.length, above = rows.filter((r) => r.total > total).length, below = rows.filter((r) => r.total < total).length;
  return { count, rank: above + 1, percentile: count ? Math.round((below / count) * 100) : 100, avg: count ? Math.round(rows.reduce((t, r) => t + r.total, 0) / count) : 0, best: Math.max(0, ...rows.map((r) => r.total)) };
}

/** Match Day and Test Match editions that are open now or opening soon, soonest first. */
export async function editions() {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.select({ key: rounds.date, kind: rounds.kind, title: rounds.title, opensMs: rounds.opensMs, closesMs: rounds.closesMs, questionIds: rounds.questionIds })
    .from(rounds).where(sql`${rounds.kind} <> 'daily'`);
  return rows
    .filter((r) => (r.closesMs ?? 0) > now)
    .map((r) => ({ key: r.key, kind: r.kind, title: r.title ?? r.key, opensMs: r.opensMs ?? 0, closesMs: r.closesMs ?? 0, balls: r.questionIds.length, live: (r.opensMs ?? 0) <= now }))
    .sort((a, b) => a.opensMs - b.opensMs);
}

/**
 * XP from every scored point, in any mode. Signed-in players' XP also counts toward this week's league, scaled by
 * `league` (Nets and archive balls count half, so the scheduled games stay the fastest way up).
 */
export async function addXp(pid: string, xp: number, { league = 1 } = {}) {
  if (!xp) return;
  const db = await getDb();
  const toLeague = (userId: string | null) => userId && import("./league").then((m) => m.addLeagueXp(pid, xp * league)).catch((e) => console.error("league xp", e));
  if (xp < 0) { // a Test Match penalty: floored at the start of the player's current level (xpAfter)
    const [p] = await db.select({ xp: players.xp, userId: players.userId }).from(players).where(eq(players.id, pid));
    if (p) { await db.update(players).set({ xp: xpAfter(p.xp, xp) }).where(eq(players.id, pid)); await toLeague(p.userId); }
    return;
  }
  const [row] = await db.update(players).set({ xp: sql`${players.xp} + ${Math.round(xp)}` }).where(eq(players.id, pid)).returning();
  if (!row) return;
  await toLeague(row.userId);
  // Levelling up can unlock legends: tell the player (bell + push). Imported lazily to avoid an import cycle.
  await import("./inbox").then((m) => m.notifyLevelUnlocks(pid, row.xp - Math.round(xp), row.xp)).catch(() => {});
}

/** IST days on which a player finished any scored game (Daily, Test Match, Evening Daily, Match Day), newest first. */
export async function playedDays(pid: string) {
  const db = await getDb();
  // A finished Who's the Player? day counts for the streak like any finished game.
  const [rows, who] = await Promise.all([
    db.select({ at: scores.createdAt }).from(scores).where(eq(scores.playerId, pid)),
    db.select({ at: schema.whoResults.createdAt }).from(schema.whoResults).where(and(eq(schema.whoResults.playerId, pid), notLike(schema.whoResults.date, "c:%"))), // creator challenges don't keep the streak
  ]);
  return [...new Set([...rows, ...who].map((r) => istDayOf(r.at.getTime())))].sort().reverse();
}
/** Days saved with a rewarded ad (owned rows "save:<day>", lib/streak.ts saveable). */
export async function savedDays(pid: string) {
  const db = await getDb();
  return (await db.select({ id: schema.owned.itemId }).from(schema.owned).where(and(eq(schema.owned.playerId, pid), like(schema.owned.itemId, "save:%")))).map((r) => r.id.slice(5));
}
export const streakFor = async (pid: string) => streakOf(await playedDays(pid), istDate(), await savedDays(pid));

export async function getProfile(pid: string) {
  const db = await getDb();
  const [p] = await db.select({ handle: players.handle, avatar: players.avatar, country: players.country }).from(players).where(eq(players.id, pid));
  return p?.handle && p.avatar && p.country ? { handle: p.handle, avatar: p.avatar, country: p.country } : null;
}

// Higher score first; on a tie, whoever finished first (sum of finish times across the period's days), then closer guesses.
type Ranked = { total: number; km: number; doneMs: number };
const better = (a: Ranked, b: Ranked) => b.total - a.total || a.doneMs - b.doneMs || a.km - b.km;

/** Player board (top 50 + your row) and country board for a day, week (Mon–Sun) or month. Longer periods sum each player's daily scores. */
export async function leaderboard(date: string, me: string | null, period: Period = "day", onlyPlayers?: Set<string>) {
  const db = await getDb();
  const [start, end] = periodRange(date, period);
  // ponytail: aggregates the whole period in memory; fine behind a short cache, move to SQL GROUP BY / a rollup table at ~100K players/day.
  const rows = await db
    .select({ playerId: scores.playerId, total: scores.total, km: scores.kmTotal, doneAt: scores.createdAt, flagged: scores.flagged, handle: players.handle, avatar: players.avatar, country: players.country, userId: players.userId })
    .from(scores)
    .leftJoin(players, eq(players.id, scores.playerId))
    .where(and(gte(scores.date, start), lte(scores.date, end)));
  // Flagged scores (see isSuspicious) only count on the player's own view, so cheaters don't notice and nobody else sees them.
  const byPlayer = new Map<string, (typeof rows)[number] & { days: number; doneMs: number }>();
  for (const r of rows) {
    if (r.flagged && r.playerId !== me) continue;
    if (!r.userId && r.playerId !== me) continue; // guests aren't ranked (they see where they would be)
    if (onlyPlayers && !onlyPlayers.has(r.playerId)) continue;
    const p = byPlayer.get(r.playerId), doneMs = r.doneAt.getTime();
    if (p) { p.total += r.total; p.km += r.km; p.doneMs += doneMs; p.days += 1; }
    else byPlayer.set(r.playerId, { ...r, doneMs, days: 1 });
  }
  const everyone = [...byPlayer.values()].sort(better);
  const guestMe = everyone.find((r) => r.playerId === me && !r.userId) ?? null;
  const all = everyone.filter((r) => r.userId);

  const count = all.length;
  const avg = count ? Math.round(all.reduce((s, r) => s + r.total, 0) / count) : 0;
  const row = (r: (typeof all)[number], i: number) => ({
    rank: i + 1, handle: r.handle ?? "anonymous", avatar: r.avatar ?? `anon${i}`, country: r.country, total: r.total, km: Math.round(r.km), days: r.days, me: r.playerId === me,
  });

  const byCountry = new Map<string, { total: number; players: number; best: number }>();
  for (const r of all) {
    if (!r.country) continue;
    const c = byCountry.get(r.country) ?? { total: 0, players: 0, best: 0 };
    c.total += r.total; c.players += 1; c.best = Math.max(c.best, r.total);
    byCountry.set(r.country, c);
  }
  const countries = [...byCountry.entries()]
    .map(([country, c]) => ({ country, players: c.players, avg: Math.round(c.total / c.players), best: c.best }))
    .sort((a, b) => b.avg - a.avg || b.players - a.players)
    .map((c, i) => ({ rank: i + 1, ...c }));

  const myIdx = guestMe ? all.filter((r) => better(r, guestMe) < 0).length : me ? all.findIndex((r) => r.playerId === me) : -1;
  const mine = guestMe ?? (myIdx >= 0 ? all[myIdx] : null);
  const below = mine ? all.filter((r) => r.total < mine.total).length : 0;
  return {
    date, period, start, end, count, avg,
    top: all.slice(0, 50).map(row),
    countries,
    me: mine ? {
      ...row(mine, myIdx),
      guest: !!guestMe, // not on the board: rank is where they'd be if signed in
      percentile: count > 1 ? Math.round((below / (count - 1)) * 100) : 100,
      countryRank: countries.find((c) => c.country === mine.country)?.rank ?? null,
    } : null,
  };
}
