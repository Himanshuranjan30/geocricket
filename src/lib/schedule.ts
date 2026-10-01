import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { TEST_MULTS } from "@/content/pool";
import { addDays, dayEndMs, MULTIPLIERS, slotKey, slotMs, testDay, type Game2, type Slot } from "./game";
import { fame } from "./seen";

// Every day's four games, in play order. The morning Daily is the plain dated round (always open from midnight).
const GAMES = [
  { game: "daily", slot: "am", mults: MULTIPLIERS, kind: "daily", title: null },
  { game: "test", slot: "am", mults: TEST_MULTS, kind: "test", title: "Morning Test Match" },
  { game: "daily", slot: "pm", mults: MULTIPLIERS, kind: "evening", title: "Evening Daily" },
  { game: "test", slot: "pm", mults: TEST_MULTS, kind: "test", title: "Evening Test Match" },
] as const;
export const BALLS_PER_DAY = GAMES.reduce((s, g) => s + g.mults.length, 0);

/** Which slot a timed round key belongs to ("test-am-D", "test-D", "evening-D"), or null for anything else. */
export function slotOfKey(key: string): { day: string; game: Game2; slot: Slot } | null {
  const m = key.match(/^(test-am|test|evening)-(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  return { day: m[2], game: m[1] === "evening" ? "daily" : "test", slot: m[1] === "test-am" ? "am" : "pm" };
}

// Pools scheduled games may draw from, in order of preference. Versus only when the edition pool runs dry, and only balls
// nobody has seen yet (so no one gets a repeat in a scored game); a borrowed ball moves to the edition pool for life.
// Never Nets: its answers are public on the Moments pages (lib/server openIds).
const POOL_ORDER: Record<string, number> = { daily: 0, edition: 1, versus: 2 };

/**
 * Make sure all four games exist for today and the next `days` days, built from live questions no round has used, best
 * known first. Idempotent (existing keys are skipped) and safe to re-run; callers hold the "daily" job lease so two
 * runs never pick the same questions. Also moves any not-yet-open timed round onto the current fixed drop times.
 */
export async function ensureSchedule(days = 7) {
  const db = await getDb();
  const { rounds, questions, seen } = schema;
  const now = Date.now();
  const existing = await db.select({ date: rounds.date, ids: rounds.questionIds, opensMs: rounds.opensMs }).from(rounds);
  const have = new Set(existing.map((r) => r.date));
  const used = new Set(existing.flatMap((r) => r.ids));

  // Drop times changed (fixed slots): re-time rounds that haven't opened yet.
  let retimed = 0;
  for (const r of existing) {
    const s = slotOfKey(r.date);
    if (!s || r.opensMs == null || r.opensMs <= now) continue;
    const opensMs = slotMs(s.day, s.game, s.slot);
    if (opensMs !== r.opensMs) { await db.update(rounds).set({ opensMs, closesMs: dayEndMs(s.day) }).where(eq(rounds.date, r.date)); retimed++; }
  }

  const live = await db.select({ id: questions.id, text: questions.text, origin: questions.origin, pool: questions.pool }).from(questions)
    .where(and(eq(questions.status, "live"), inArray(questions.pool, Object.keys(POOL_ORDER))));
  const borrowable = live.some((q) => q.pool === "versus");
  const seenIds = borrowable ? new Set((await db.selectDistinct({ q: seen.questionId }).from(seen)).map((r) => r.q)) : new Set<string>();
  const free = live
    .filter((q) => !used.has(q.id) && (q.pool === "daily" || q.pool === "edition" || !seenIds.has(q.id)))
    .sort((a, b) => POOL_ORDER[a.pool] - POOL_ORDER[b.pool] || fame(b) - fame(a));

  // Repair: a question may belong to only one round (older scripts could reuse one). Rounds already open or played keep
  // theirs; a not-yet-open, unplayed round swaps each shared question for a fresh one.
  const started = new Set((await db.selectDistinct({ d: schema.starts.date }).from(schema.starts)).map((r) => r.d));
  const today = testDay();
  const locked = (r: (typeof existing)[number]) => started.has(r.date) || (slotOfKey(r.date) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? (r.opensMs ?? 0) <= now : r.date <= today);
  const owner = new Set<string>();
  let repaired = 0;
  for (const r of [...existing.filter(locked), ...existing.filter((r) => !locked(r)).sort((a, b) => (a.opensMs ?? dayEndMs(a.date)) - (b.opensMs ?? dayEndMs(b.date)))]) {
    const clash = r.ids.filter((id) => owner.has(id));
    if (clash.length && !locked(r) && free.length >= clash.length) {
      const swap = new Map(clash.map((id) => [id, free.shift()!]));
      const borrowed = [...swap.values()].filter((q) => q.pool === "nets" || q.pool === "versus").map((q) => q.id);
      if (borrowed.length) await db.update(questions).set({ pool: "edition" }).where(inArray(questions.id, borrowed));
      r.ids = r.ids.map((id) => swap.get(id)?.id ?? id);
      await db.update(rounds).set({ questionIds: r.ids }).where(eq(rounds.date, r.date));
      repaired++;
    }
    r.ids.forEach((id) => owner.add(id));
  }

  const made: string[] = [];
  let short = false;
  outer: for (let i = 0; i <= days; i++) {
    const day = addDays(testDay(), i);
    for (const g of GAMES) {
      const key = slotKey(day, g.game, g.slot);
      if (have.has(key)) continue;
      if (free.length < g.mults.length) { short = true; break outer; }
      const picked = free.splice(0, g.mults.length);
      const borrowed = picked.filter((q) => q.pool === "nets" || q.pool === "versus").map((q) => q.id);
      if (borrowed.length) await db.update(questions).set({ pool: "edition" }).where(inArray(questions.id, borrowed));
      const window = g.kind === "daily" ? {} : { opensMs: slotMs(day, g.game, g.slot), closesMs: dayEndMs(day) };
      const ins = await db.insert(rounds).values({
        date: key, kind: g.kind, title: g.title ? `${g.title} · ${day}` : null, questionIds: picked.map((q) => q.id), mults: [...g.mults], ...window,
      }).onConflictDoNothing().returning();
      if (ins.length) made.push(key);
    }
  }

  // Runway: full days scheduled from today, and how many more days the unused questions cover.
  const all = new Set([...have, ...made]);
  let daysAhead = 0;
  while (GAMES.every((g) => all.has(slotKey(addDays(testDay(), daysAhead), g.game, g.slot)))) daysAhead++;
  return { made, retimed, repaired, short, daysAhead, freeLeft: free.length, runwayDays: daysAhead + Math.floor(free.length / BALLS_PER_DAY) };
}
