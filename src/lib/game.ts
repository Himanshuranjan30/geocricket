// Pure game logic shared by client and server.

export const MULTIPLIERS = [1, 1, 2, 3, 3] as const; // 1,000-point day
export const QUESTIONS_PER_ROUND = MULTIPLIERS.length;

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: [number, number], b: [number, number]) {
  const [lng1, lat1] = a.map(rad);
  const [lng2, lat2] = b.map(rad);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 100 within 5 km, then exponential decay scaled per question. */
export function pointsFor(km: number, scaleKm: number) {
  if (km <= 5) return 100;
  return Math.round(100 * Math.exp(-km / scaleKm));
}

export type Tier = { min: number; emoji: string; color: string; toast: string };
export const TIERS: Tier[] = [
  { min: 100, emoji: "🟢", color: "#46C27A", toast: "Plumb. Dead plumb." },
  { min: 90, emoji: "🟢", color: "#46C27A", toast: "Middle of the bat" },
  { min: 50, emoji: "🟡", color: "#F2B53A", toast: "Edged, but it carried" },
  { min: 20, emoji: "🟠", color: "#EE7B30", toast: "Dropped at fine leg" },
  { min: 1, emoji: "🔴", color: "#D2283C", toast: "Wrong ground, wrong format" },
  { min: 0, emoji: "⚫", color: "#6B7890", toast: "Lost ball" },
];
export const tierOf = (points: number) => TIERS.find((t) => points >= t.min)!;

// Four games a day, on India time, at fixed times so players can build a habit (and the push crons, which Vercel Hobby
// fires somewhere inside their hour, always land after the drop): the 5-ball Daily is open all day from midnight, the
// 10-ball Morning Test drops at 8 AM, the Evening Daily at 6 PM and the Evening Test at 8 PM. Every game belongs to its
// calendar day and closes at midnight IST: nothing stays open into the next day.
export const SLOT_MINUTES_IST = { "daily:am": 0, "test:am": 8 * 60, "daily:pm": 18 * 60, "test:pm": 20 * 60 } as const;
export type Game2 = "daily" | "test";
export type Slot = "am" | "pm";
const ymdIst = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ms));
/** The first instant of a day ("YYYY-MM-DD") in India. */
export const dayStartMs = (day: string) => Date.parse(`${day}T00:00:00+05:30`);
/** The instant a game's slot drops on a day ("YYYY-MM-DD"). */
export const slotMs = (day: string, game: Game2, slot: Slot) => dayStartMs(day) + SLOT_MINUTES_IST[`${game}:${slot}`] * 60e3;
/** Round key for a slot: the morning Daily is the plain date; the rest are timed rounds. */
export const slotKey = (day: string, game: Game2, slot: Slot) =>
  game === "daily" ? (slot === "am" ? day : `evening-${day}`) : slot === "pm" ? `test-${day}` : `test-am-${day}`;
export const SLOTS: { game: Game2; slot: Slot }[] = [{ game: "daily", slot: "am" }, { game: "test", slot: "am" }, { game: "daily", slot: "pm" }, { game: "test", slot: "pm" }];
/** Morning Daily drop (kept for callers that only care about Game 1). */
export const dropMs = (day: string, game: Game2) => slotMs(day, game, game === "daily" ? "am" : "pm");
/** The last instant of a day in India. */
export const dayEndMs = (day: string) => Date.parse(`${day}T23:59:59.999+05:30`);

/**
 * The five public challenges of a day: the only things that count on the leaderboard (lib/server leaderboard).
 * max = points available (5 balls × MULTIPLIERS, 10 balls × TEST_MULTS in content/pool.ts, 3 Mystery players × 100).
 */
export const CHALLENGES = [
  { id: "daily", short: "D", name: "Daily", max: 1000, opens: "00:00" },
  { id: "mtest", short: "MT", name: "Morning Test", max: 1900, opens: "08:00" },
  { id: "evening", short: "ED", name: "Evening Daily", max: 1000, opens: "18:00" },
  { id: "etest", short: "ET", name: "Evening Test", max: 1900, opens: "20:00" },
  { id: "mystery", short: "M", name: "Mystery Cricketer", max: 300, opens: "00:00" },
] as const;
export type ChallengeId = (typeof CHALLENGES)[number]["id"];
export const DAY_MAX = CHALLENGES.reduce((s, c) => s + c.max, 0);
/** Which challenge a scores.date round key is ("2026-10-04", "test-am-…", "evening-…", "test-…"); null for anything else. */
export const challengeOfKey = (key: string): ChallengeId | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(key) ? "daily" : key.startsWith("test-am-") ? "mtest" : key.startsWith("evening-") ? "evening" : key.startsWith("test-") ? "etest" : null;
/** Where to play a challenge on a day, and when it opens (epoch ms). */
export const challengeHref = (id: ChallengeId, day: string) =>
  id === "daily" ? "/" : id === "mystery" ? "/mystery" : `/test/${id === "mtest" ? `test-am-${day}` : id === "evening" ? `evening-${day}` : `test-${day}`}`;
export const challengeOpensMs = (id: ChallengeId, day: string) => {
  const c = CHALLENGES.find((x) => x.id === id)!; const [h, m] = c.opens.split(":").map(Number);
  return dayStartMs(day) + (h * 60 + m) * 60e3;
};

/** Today's date in India. */
/** Rough cricket region of a pin, for spreading a round's questions around the world. */
export function zoneOf(lat: number, lng: number) {
  if (lng < -30) return "americas"; // incl. the Caribbean
  if (lat < -10 && lng > 110) return "oceania";
  if (lng > 92) return "east-asia";
  if (lng >= 60 && lat > 0) return "south-asia";
  if (lng >= 35 && lat > 12) return "gulf";
  if (lat < 35) return "africa";
  return "europe";
}

/**
 * Pick `n` questions from `ranked` (best first) so a round travels: within the top `window`, no region gets a second
 * question until every region present has had one (then a third, and so on). Keeps ranked order within the round.
 */
export function spreadPick<T extends { lat: number; lng: number }>(ranked: T[], n: number, window = 60): T[] {
  const pool = ranked.slice(0, Math.max(window, n)), took = new Set<T>(), per = new Map<string, number>();
  for (let cap = 1; took.size < n && cap <= n; cap++) for (const q of pool) {
    if (took.size >= n) break;
    const z = zoneOf(q.lat, q.lng);
    if (!took.has(q) && (per.get(z) ?? 0) < cap) { took.add(q); per.set(z, (per.get(z) ?? 0) + 1); }
  }
  return pool.filter((q) => took.has(q));
}

export function istDate(d = new Date()) {
  return ymdIst(d.getTime());
}
/** Today's Test Match day. */
export const testDay = (now = Date.now()) => ymdIst(now);
/** The Monday (YYYY-MM-DD, IST) that starts the week a day falls in: leagues and streak freezes run Mon–Sun. */
export const weekOf = (day: string) => addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
/** Is a day's Daily open at this moment (its drop → midnight IST)? */
export const dailyOpen = (day: string, now = Date.now()) => now >= dropMs(day, "daily") && now <= dayEndMs(day);
/** A timed slot's window: its drop → midnight IST the same day. */
export const slotWindow = (day: string, game: Game2, slot: Slot) => ({ opensMs: slotMs(day, game, slot), closesMs: dayEndMs(day) });
/** The evening Test Match's window. */
export const testWindow = (day: string) => slotWindow(day, "test", "pm");
/** When each game next drops: today's if it hasn't yet, else tomorrow's. */
export function nextDrops(now = Date.now()) {
  const today = ymdIst(now), next = (g: Game2) => (now < dropMs(today, g) ? dropMs(today, g) : dropMs(addDays(today, 1), g));
  return { daily: next("daily"), test: next("test") };
}

/** The next game to drop after `now` (today's if any are left, else tomorrow's Daily at midnight). */
export function nextSlot(now = Date.now()) {
  const today = ymdIst(now);
  for (const day of [today, addDays(today, 1)]) for (const s of SLOTS) { const ms = slotMs(day, s.game, s.slot); if (ms > now) return { ...s, day, ms }; }
  throw new Error("unreachable");
}
export const slotName = (game: Game2, slot: Slot) => (game === "daily" ? (slot === "am" ? "Daily" : "Evening Daily") : slot === "am" ? "Morning Test Match" : "Evening Test Match");

export function addDays(date: string, n: number) {
  return new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);
}

/** Great-circle points from a to b, longitudes unwrapped so lines never jump the antimeridian. */
export function greatCircle(a: [number, number], b: [number, number], steps = 64): [number, number][] {
  const toV = ([lng, lat]: [number, number]) => [Math.cos(rad(lat)) * Math.cos(rad(lng)), Math.cos(rad(lat)) * Math.sin(rad(lng)), Math.sin(rad(lat))];
  const va = toV(a), vb = toV(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const w = Math.acos(dot);
  const out: [number, number][] = [];
  let prev = a[0];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s1 = w < 1e-9 ? 1 - t : Math.sin((1 - t) * w) / Math.sin(w);
    const s2 = w < 1e-9 ? t : Math.sin(t * w) / Math.sin(w);
    const x = s1 * va[0] + s2 * vb[0], y = s1 * va[1] + s2 * vb[1], z = s1 * va[2] + s2 * vb[2];
    let lng = (Math.atan2(y, x) * 180) / Math.PI;
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    prev = lng;
    out.push([lng, lat]);
  }
  return out;
}

export type Period = "day" | "week" | "month";

/** Inclusive [start, end] dates (YYYY-MM-DD) of the day/week (Mon–Sun)/month containing `date`. */
export function periodRange(date: string, period: Period): [string, string] {
  if (period === "day") return [date, date];
  const d = new Date(date + "T00:00:00Z");
  if (period === "week") {
    const start = addDays(date, -((d.getUTCDay() + 6) % 7)); // back to Monday
    return [start, addDays(start, 6)];
  }
  const start = date.slice(0, 8) + "01";
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return [start, end];
}

/** Same date moved by one period (for previous/next navigation). */
export function shiftPeriod(date: string, period: Period, dir: 1 | -1) {
  if (period === "day") return addDays(date, dir);
  if (period === "week") return addDays(date, 7 * dir);
  const d = new Date(date.slice(0, 8) + "01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}

/** Shot clock per question. Enforced on the server for the daily; guesses after the limit (+ network grace) score 0. */
export const QUESTION_SECONDS = 20;
export const GRACE_MS = 2500;
/** Result screen moves to the next question on its own after this long. */
export const AUTO_NEXT_SECONDS = 8;
export const MISS_KM = 20015; // half the Earth's circumference: the worst possible miss, used for timed-out questions

/** Near-perfect total at inhuman speed: hide from other players' leaderboards until reviewed. */
export const isSuspicious = (total: number, totalMs: number, max = 1000, questions = 5) => total >= 0.95 * max && totalMs < 4000 * questions;

/** "1 ball", "4 balls", "1,203 players" (en-IN digits). */
export const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;
