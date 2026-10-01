import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, istDate, slotMs } from "./game";
import { levelOf } from "./level";
import { LEGENDS } from "./legends";
import { offerFor } from "./offer";
import { pushTo } from "./push";
import { timeAt } from "./resetTime";
import { leaderboard, streakFor } from "./server";

const { notifications, players } = schema;
export type Note = { key: string; kind: string; title: string; body: string; url: string };

/** Add a notification once per key (and optionally send it as a push alert). True if it was new. */
export async function notify(pid: string, n: Note, push = false) {
  const db = await getDb();
  const ins = await db.insert(notifications).values({ id: crypto.randomUUID(), playerId: pid, ...n, createdMs: Date.now() }).onConflictDoNothing().returning();
  if (ins.length && push) await pushTo(pid, { title: n.title, body: n.body, url: n.url, tag: n.kind });
  return ins.length > 0;
}

/** Legends newly unlocked by crossing XP levels (call with XP before and after a gain). */
export async function notifyLevelUnlocks(pid: string, before: number, after: number) {
  const a = levelOf(before).level, b = levelOf(after).level;
  if (b <= a) return;
  for (const l of LEGENDS.filter((x) => x.level > a && x.level <= b)) {
    await notify(pid, { key: `legend-${l.id}`, kind: "legend", title: `👑 ${l.name} unlocked!`, body: `You reached level ${l.level}. Play as ${l.name.split(" ")[0]} now.`, url: `/locker?pick=${l.id}` }, true);
  }
}

/**
 * Notifications that depend on the day, created lazily when the player opens the app:
 * today's games, streak at risk (after 5pm IST), yesterday's result, the running first-purchase offer.
 */
async function daily(pid: string, signedIn: boolean, country: string | null) {
  const today = istDate(), yday = addDays(today, -1);
  const s = await streakFor(pid);
  if (!s.playedToday) await notify(pid, { key: `games-${today}`, kind: "games", title: "🏏 Today's Daily is open", body: gamesLine(country), url: "/play" });
  const istHour = new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
  if (s.atRisk && s.current >= 2 && istHour >= 17) await notify(pid, { key: `streak-${today}`, kind: "streak", title: `🔥 Your ${s.current}-day streak ends at midnight`, body: "Finish any game today to keep it alive.", url: "/play" });
  const r = await recap(pid, yday);
  if (r) await notify(pid, r.note(signedIn));
  const o = await offerFor(pid, signedIn);
  if (o.eligible && o.active && o.endsMs) await notify(pid, { key: "offer-first", kind: "offer", title: "🎁 Your first legend, half price", body: "One time only, for 72 hours.", url: "/locker" });
}

/** "Open till midnight IST · Morning Test 8:00 AM · Evening Daily 6:00 PM · Evening Test 8:00 PM", in the player's time. */
export function gamesLine(country: string | null) {
  const day = istDate(), t = (g: "daily" | "test", sl: "am" | "pm") => timeAt(slotMs(day, g, sl), country).replace(/ IST$/, "");
  return `5 balls, open till midnight IST. Morning Test ${t("test", "am")} · Evening Daily ${t("daily", "pm")} · Evening Test ${t("test", "pm")}.`;
}

/**
 * How a player did in a day's Daily (their rank, or where a guest would have ranked), as a bell note. Top-10 finishes
 * with 25+ players keep their "rank-" key: the podium and top-10 badges count those (lib/career.ts).
 */
export async function recap(pid: string, day: string) {
  const board = await leaderboard(day, pid, "day");
  const me = board.me;
  if (!me) return null;
  const top10 = board.count >= 25 && !me.guest && me.rank <= 10;
  const of = board.count > 1 ? ` of ${board.count.toLocaleString("en-IN")}` : "";
  return {
    me, count: board.count,
    note: (signedIn: boolean): Note => top10
      ? { key: `rank-${day}`, kind: "rank", title: `🏆 You finished #${me.rank} yesterday`, body: me.countryRank ? `Your country is #${me.countryRank} on the country board.` : "Top 10 in the world. Keep it going.", url: "/leaderboard" }
      : { key: `recap-${day}`, kind: "rank", url: "/leaderboard",
        title: me.guest || !signedIn ? `📊 Yesterday you'd have been #${me.rank}${of}` : `📊 Yesterday you finished #${me.rank}${of}`,
        body: `${board.count > 1 && me.percentile > 0 ? `Better than ${me.percentile}% of players. ` : ""}${me.guest || !signedIn ? "Sign in to get on the board. " : ""}Today's Daily is open.` },
  };
}

/** Bell + push for badges earned since last time (each badge announces once). */
export async function notifyNewBadges(pid: string, badges: { id: string; name: string; desc: string; tier: number; tiers: readonly number[] }[]) {
  const TIER = ["Bronze", "Silver", "Gold", "Platinum"];
  for (const b of badges) for (let t = 0; t <= b.tier; t++)
    await notify(pid, { key: `badge-${b.id}-${t}`, kind: "badge", title: `🏅 ${TIER[t]} ${b.name}`, body: `${b.desc}: ${b.tiers[t].toLocaleString("en-IN")}`, url: "/profile" }, t >= 2);
}

export async function inboxFor(pid: string, signedIn: boolean) {
  const db = await getDb();
  const [p] = await db.select({ country: players.country }).from(players).where(eq(players.id, pid));
  await daily(pid, signedIn, p?.country ?? null).catch(() => {});
  // ponytail: recomputes the career on each bell refresh; cache per day if players pile up.
  await import("./career").then(async (m) => notifyNewBadges(pid, (await m.careerFor(pid, signedIn)).badges)).catch(() => {});
  const items = await db.select().from(notifications).where(eq(notifications.playerId, pid)).orderBy(desc(notifications.createdMs)).limit(30);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.playerId, pid), isNull(notifications.readMs)));
  return { items: items.map((x) => ({ id: x.id, kind: x.kind, title: x.title, body: x.body, url: x.url, createdMs: x.createdMs, readMs: x.readMs })), unread: n };
}

export async function markRead(pid: string, ids?: string[]) {
  const db = await getDb();
  const where = ids?.length ? and(eq(notifications.playerId, pid), inArray(notifications.id, ids)) : eq(notifications.playerId, pid);
  await db.update(notifications).set({ readMs: Date.now() }).where(and(where, isNull(notifications.readMs)));
}
