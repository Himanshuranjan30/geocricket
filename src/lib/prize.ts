import "server-only";
import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, istDate } from "./game";
import { notify } from "./inbox";
import { leaderboard } from "./server";

// Daily prize: #1 on a day's leaderboard (lib/server leaderboard: signed-in players, flagged games excluded) wins ₹100.
// Days settle lazily after midnight IST whenever the board, home page or admin is opened, so no cron is needed.
export const PRIZE_INR = 100;
export const PRIZE_FROM = "2026-10-04"; // first prize day
const { prizes, players, user } = schema;
const UPI = /^[\w.-]{2,256}@[a-zA-Z][\w.-]{1,64}$/;

/** Record the winner of every closed prize day not settled yet, and tell them. Idempotent (the day is the primary key). */
export async function settlePrizes(from = PRIZE_FROM) {
  const yday = addDays(istDate(), -1);
  if (yday < from) return;
  const db = await getDb();
  const done = new Set((await db.select({ day: prizes.day }).from(prizes).where(gte(prizes.day, from))).map((r) => r.day));
  for (let day = from; day <= yday; day = addDays(day, 1)) {
    if (done.has(day)) continue;
    const top = (await leaderboard(day, null)).top[0];
    // Rows carry handles, not ids (ids never leave the server); handles are unique ignoring case.
    const [p] = top ? await db.select({ id: players.id }).from(players).where(eq(players.handle, top.handle)).limit(1) : [];
    const ins = await db.insert(prizes).values({ day, playerId: p?.id ?? null, handle: top?.handle ?? null, points: top?.total ?? 0, createdMs: Date.now() })
      .onConflictDoNothing().returning();
    if (ins.length && p) await notify(p.id, { key: `prize-${day}`, kind: "prize", title: `🏆 You won ₹${PRIZE_INR}!`,
      body: `You topped the leaderboard on ${day} with ${top!.total.toLocaleString("en-IN")} points. Claim it with your UPI ID.`, url: "/prize" }, true);
  }
}

/** For the board and home page: the latest winner, and this player's prizes (unclaimed first). */
export async function prizeState(pid: string | null) {
  await settlePrizes();
  const db = await getDb();
  const [last] = await db.select({ day: prizes.day, handle: prizes.handle, points: prizes.points }).from(prizes)
    .where(isNotNull(prizes.playerId)).orderBy(desc(prizes.day)).limit(1);
  const mine = pid ? await db.select({ day: prizes.day, points: prizes.points, claimed: prizes.claimedMs, paid: prizes.paidMs }).from(prizes)
    .where(eq(prizes.playerId, pid)).orderBy(desc(prizes.day)) : [];
  return {
    amount: PRIZE_INR, last: last ?? null,
    mine: mine.map((m) => ({ day: m.day, points: m.points, status: m.paid ? "paid" : m.claimed ? "claimed" : "unclaimed" as "paid" | "claimed" | "unclaimed" })),
  };
}

/** The winner gives a UPI ID for one of their unclaimed prizes. */
export async function claimPrize(pid: string, day: string, upi: string) {
  const id = upi.trim();
  if (!UPI.test(id)) return { ok: false as const, error: "That doesn't look like a UPI ID (like name@okaxis)." };
  const db = await getDb();
  const done = await db.update(prizes).set({ upi: id, claimedMs: Date.now() })
    .where(and(eq(prizes.day, day), eq(prizes.playerId, pid), isNull(prizes.paidMs))).returning();
  return done.length ? { ok: true as const } : { ok: false as const, error: "No prize to claim for that day." };
}

/** Admin: every settled day, newest first, with the winner's contact and payout status. */
export async function prizeAdminList() {
  await settlePrizes();
  const db = await getDb();
  return db.select({ day: prizes.day, handle: prizes.handle, points: prizes.points, upi: prizes.upi, claimedMs: prizes.claimedMs, paidMs: prizes.paidMs, email: user.email })
    .from(prizes).leftJoin(players, eq(players.id, prizes.playerId)).leftJoin(user, eq(user.id, players.userId)).orderBy(desc(prizes.day)).limit(120);
}

export async function markPrizePaid(day: string, paid: boolean) {
  const db = await getDb();
  await db.update(prizes).set({ paidMs: paid ? Date.now() : null }).where(eq(prizes.day, day));
}
