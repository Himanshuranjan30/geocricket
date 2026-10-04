import "server-only";
import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currencyOf, money } from "./currency";
import { inrRates } from "./fx";
import { addDays, istDate } from "./game";
import { notify } from "./inbox";
import { leaderboard } from "./server";

// Daily prize: #1 on a day's leaderboard (lib/server leaderboard: signed-in players, flagged games excluded) wins ₹100,
// or the same value in their own currency (their profile country, at that day's rate).
// Days settle lazily after midnight IST whenever the board, home page or admin is opened, so no cron is needed.
export const PRIZE_INR = 100;
export const PRIZE_FROM = "2026-10-04"; // first prize day
const { prizes, players, user } = schema;
const UPI = /^[\w.-]{2,256}@[a-zA-Z][\w.-]{1,64}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// How a winner gets paid: UPI in India, PayPal or an Amazon gift card anywhere else. Paid by hand from /admin/prize.
export const AMAZON_STORES = ["US", "UK", "India", "Canada", "Australia", "Germany", "France", "Italy", "Spain", "Japan", "UAE", "Singapore", "Netherlands"] as const;

/** ₹100 in the currency of a profile country, at today's rate (rupees if rates are unavailable). */
export async function localPrize(country: string | null | undefined) {
  const want = currencyOf(country), rate = want === "INR" ? 1 : (await inrRates())?.[want];
  const currency = rate ? want : "INR", amount = Math.round(PRIZE_INR * (rate ?? 1) * 100) / 100;
  return { currency, amount, label: money(amount, currency) };
}

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
    const [p] = top ? await db.select({ id: players.id, country: players.country }).from(players).where(eq(players.handle, top.handle)).limit(1) : [];
    const prize = await localPrize(p?.country);
    const ins = await db.insert(prizes).values({ day, playerId: p?.id ?? null, handle: top?.handle ?? null, points: top?.total ?? 0,
      currency: prize.currency, amount: prize.amount, createdMs: Date.now() }).onConflictDoNothing().returning();
    if (ins.length && p) await notify(p.id, { key: `prize-${day}`, kind: "prize", title: `🏆 You won ${prize.label}!`,
      body: `You topped the leaderboard on ${day} with ${top!.total.toLocaleString("en-IN")} points. Tell us how to pay you.`, url: "/prize" }, true);
  }
}

/** For the board and home page: today's prize in this player's currency, the latest winner, and their own prizes. */
export async function prizeState(pid: string | null) {
  await settlePrizes();
  const db = await getDb();
  const [last] = await db.select({ day: prizes.day, handle: prizes.handle, points: prizes.points, currency: prizes.currency, amount: prizes.amount }).from(prizes)
    .where(isNotNull(prizes.playerId)).orderBy(desc(prizes.day)).limit(1);
  const mine = pid ? await db.select({ day: prizes.day, points: prizes.points, claimed: prizes.claimedMs, paid: prizes.paidMs, currency: prizes.currency, amount: prizes.amount })
    .from(prizes).where(eq(prizes.playerId, pid)).orderBy(desc(prizes.day)) : [];
  const [me] = pid ? await db.select({ country: players.country, userId: players.userId }).from(players).where(eq(players.id, pid)).limit(1) : [];
  const today = await localPrize(me?.country);
  return {
    label: today.label, currency: today.currency, signedIn: !!me?.userId, country: me?.country ?? null, stores: AMAZON_STORES,
    last: last ? { day: last.day, handle: last.handle, points: last.points, label: money(last.amount, last.currency) } : null,
    mine: mine.map((m) => ({ day: m.day, points: m.points, label: money(m.amount, m.currency), status: m.paid ? "paid" : m.claimed ? "claimed" : "unclaimed" as "paid" | "claimed" | "unclaimed" })),
  };
}

/** The winner says how to pay them for one of their prizes (they can change it until it's paid). */
export async function claimPrize(pid: string, day: string, method: string, to: string, store = "") {
  const v = to.trim();
  if (method === "upi" && !UPI.test(v)) return { ok: false as const, error: "That doesn't look like a UPI ID (like name@okaxis)." };
  if ((method === "paypal" || method === "amazon") && !EMAIL.test(v)) return { ok: false as const, error: "Enter a valid email address." };
  if (method === "amazon" && !(AMAZON_STORES as readonly string[]).includes(store)) return { ok: false as const, error: "Pick your Amazon store." };
  if (!["upi", "paypal", "amazon"].includes(method)) return { ok: false as const, error: "Pick how you'd like to be paid." };
  const db = await getDb();
  const done = await db.update(prizes).set({ method, payTo: method === "amazon" ? `${v} · Amazon ${store}` : v, claimedMs: Date.now() })
    .where(and(eq(prizes.day, day), eq(prizes.playerId, pid), isNull(prizes.paidMs))).returning();
  return done.length ? { ok: true as const } : { ok: false as const, error: "No prize to claim for that day." };
}

/** Admin: every settled day, newest first, with the winner's contact and payout status. */
export async function prizeAdminList() {
  await settlePrizes();
  const db = await getDb();
  return db.select({ day: prizes.day, handle: prizes.handle, points: prizes.points, currency: prizes.currency, amount: prizes.amount, method: prizes.method, payTo: prizes.payTo, claimedMs: prizes.claimedMs, paidMs: prizes.paidMs, email: user.email, country: players.country })
    .from(prizes).leftJoin(players, eq(players.id, prizes.playerId)).leftJoin(user, eq(user.id, players.userId)).orderBy(desc(prizes.day)).limit(120);
}

export async function markPrizePaid(day: string, paid: boolean) {
  const db = await getDb();
  await db.update(prizes).set({ paidMs: paid ? Date.now() : null }).where(eq(prizes.day, day));
}
