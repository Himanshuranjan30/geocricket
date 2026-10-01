import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import raw from "@/content/who.json";
import photos from "@/content/who-photos.json";
import { istDate } from "./game";
import { CLUES, PER_DAY, POINTS, puzzleState, shareText, type Clue } from "./whoRules";

export { POINTS, CLUES, PER_DAY };

// "Who's the Player?": three players a day, five clues each. A guess or a skip on clue n costs nothing but moves you
// to clue n+1; solving on clue n scores POINTS[n]. Content (answers included) is built by scripts/who-build.mjs and
// never sent to the client: the API hands out only the clues a player has already earned.

type Puzzle = { player: string; fame: number; anchor: string; story: string; clues: Clue[] };
type Content = { start: string; players: { id: string; name: string; team: string }[]; puzzles: Record<string, Puzzle>; days: Record<string, string[]> };
const content = raw as unknown as Content;

const hasPhoto = new Set(Object.keys(photos)); // public/players/<id>.jpg, fetched by scripts/who-photos.mjs
export const whoPlayers = () => content.players.map((p) => ({ ...p, photo: hasPhoto.has(p.id) }));
const playerById = new Map(content.players.map((p) => [p.id, p]));
const dayKeys = Object.keys(content.days).sort();
export const whoPlayer = (id: string) => { const p = playerById.get(id); return p ? { ...p, photo: hasPhoto.has(p.id) } : null; };
/** Players who are a daily answer between `from` and `to` (inclusive): the 1v1 bank keeps clear of them. */
export const dailyPlayersBetween = (from: string, to: string) =>
  new Set(dayKeys.filter((d) => d >= from && d <= to).flatMap((d) => content.days[d].map((k) => content.puzzles[k].player)));

/** The puzzle set for a date, or null if nothing is scheduled. Future days are never served (they'd leak answers). */
export function whoDay(date: string, today = istDate()) {
  if (date > today) return null;
  const ids = content.days[date];
  return ids ? { date, number: dayKeys.indexOf(date) + 1, puzzles: ids.map((id) => content.puzzles[id]) } : null;
}
export const whoToday = () => whoDay(istDate());

// "Beat my Who" links carry a keyed hash of the sharer's player id (ids double as login cookies, so never the id).
export const challengeCode = (pid: string) => createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "geocricket").update(`who:${pid}`).digest("hex").slice(0, 10);

/** The sharer behind a challenge code, if they finished that day: their handle and how each puzzle went. */
async function rivalFor(code: string, date: string, me: string | null) {
  const db = await getDb();
  // ponytail: hashes every result of the day to find the code; fine to ~50K plays a day, then store the code on the row.
  const rows = await db.select({ pid: schema.whoResults.playerId, total: schema.whoResults.total, steps: schema.whoResults.steps }).from(schema.whoResults).where(eq(schema.whoResults.date, date));
  const r = rows.find((x) => challengeCode(x.pid) === code);
  if (!r || r.pid === me) return null;
  const [p] = await db.select({ handle: schema.players.handle, avatar: schema.players.avatar }).from(schema.players).where(eq(schema.players.id, r.pid));
  return { handle: p?.handle ?? null, avatar: p?.avatar ?? null, total: r.total, steps: r.steps };
}

/** Everything the page needs for one player and one day: earned clues only, answers only once a puzzle is over. */
export async function whoView(pid: string | null, date: string, vs?: string | null) {
  const day = whoDay(date);
  if (!day) return null;
  const db = await getDb();
  const rows = pid ? await db.select().from(schema.whoGuesses).where(and(eq(schema.whoGuesses.playerId, pid), eq(schema.whoGuesses.date, date))) : [];
  const items = day.puzzles.map((p, idx) => {
    const st = puzzleState(rows.filter((r) => r.idx === idx));
    const answer = playerById.get(p.player)!;
    return {
      idx,
      clues: p.clues.slice(0, st.done ? CLUES : st.step + 1),
      step: st.step, done: st.done, solvedAt: st.solvedAt, points: st.points,
      misses: st.picks.map((id) => (id ? playerById.get(id)?.name ?? "?" : null)),
      answer: st.done ? { id: answer.id, name: answer.name, team: answer.team, story: p.story, photo: hasPhoto.has(answer.id) } : null,
    };
  });
  const finished = items.every((i) => i.done);
  const total = items.reduce((s, i) => s + i.points, 0);
  let result: { total: number; betterThan: number | null; share: string } | null = null;
  if (finished && pid) {
    const [[{ below }], [{ all }]] = await Promise.all([
      db.select({ below: sql<number>`count(*)::int` }).from(schema.whoResults).where(and(eq(schema.whoResults.date, date), lt(schema.whoResults.total, total))),
      db.select({ all: sql<number>`count(*)::int` }).from(schema.whoResults).where(eq(schema.whoResults.date, date)),
    ]);
    const betterThan = all >= 5 ? Math.round((100 * below) / all) : null; // a percentage of four people means nothing
    result = { total, betterThan, share: shareText(day.number, items.map((i) => i.solvedAt), total, betterThan, `Beat me: geocricket.app/mystery?date=${date}&vs=${challengeCode(pid)}`) };
  }
  const rival = vs ? await rivalFor(vs, date, pid) : null;
  return { date, number: day.number, items, total, finished, result, rival };
}

/** Records one guess (pick = player id) or skip (pick = null). Safe to retry: the step is decided here, and a second
 * request for the same step hits the primary key and changes nothing. */
export async function whoGuess(pid: string, date: string, idx: number, pick: string | null) {
  const day = whoDay(date);
  if (!day || !Number.isInteger(idx) || idx < 0 || idx >= day.puzzles.length) return { error: "That puzzle isn't open." } as const;
  if (pick !== null && !playerById.has(pick)) return { error: "Pick a player from the list." } as const;
  const db = await getDb();
  const mine = await db.select().from(schema.whoGuesses).where(and(eq(schema.whoGuesses.playerId, pid), eq(schema.whoGuesses.date, date), eq(schema.whoGuesses.idx, idx)));
  const st = puzzleState(mine);
  if (st.done) return { ok: true, already: true } as const;
  if (pick !== null && st.picks.includes(pick)) return { error: "You've already tried that player." } as const;
  const correct = pick === day.puzzles[idx].player;
  // A parallel guess may have taken this step first; only claim "correct" if ours is the one recorded.
  const ins = await db.insert(schema.whoGuesses).values({ playerId: pid, date, idx, step: st.step, pick, correct, atMs: Date.now() }).onConflictDoNothing().returning();
  return { ok: true, correct: ins.length > 0 && correct } as const;
}

/** Called when a player's last puzzle of the day is done: one result row per player per day. */
export async function saveWhoResult(pid: string, date: string, steps: (number | null)[], total: number) {
  const db = await getDb();
  const ins = await db.insert(schema.whoResults).values({ playerId: pid, date, total, steps }).onConflictDoNothing().returning();
  return ins.length > 0;
}
