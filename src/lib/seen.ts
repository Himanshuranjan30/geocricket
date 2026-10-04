import "server-only";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { seen, questions } = schema;
export type Pool = "daily" | "edition" | "nets" | "versus";

/** Record that these questions were shown to a player. First sighting wins. */
export async function markSeen(playerId: string, questionIds: string[], mode: string) {
  if (!questionIds.length) return;
  const db = await getDb();
  const atMs = Date.now();
  await db.insert(seen).values(questionIds.map((questionId) => ({ playerId, questionId, mode, atMs }))).onConflictDoNothing();
}

export async function seenBy(playerIds: string[]) {
  if (!playerIds.length) return new Set<string>();
  const db = await getDb();
  const rows = await db.select({ q: seen.questionId }).from(seen).where(inArray(seen.playerId, playerIds));
  return new Set(rows.map((r) => r.q));
}

// How well known a question's moment is, so practice and duels lead with ones players can actually place. Hand-written
// questions are famous by construction; Cricsheet ones rank by the teams and competition they mention; Wikidata
// birthplaces sit in between. Associate cricket is only nudged down (not buried), so the whole cricket world shows up.
const MAJOR = /\b(India|Australia|England|South Africa|New Zealand|Pakistan|Sri Lanka|West Indies|Bangladesh|Afghanistan|Zimbabwe|Ireland)\b/g;
const BIG = /\b(Test|ODI|T20I|World Cup|World Twenty20|Indian Premier League|Big Bash|Champions Trophy|Ashes)\b/;
const MINOR = /Qualifier|Pentangular|Premier Cup|Continental Cup|Asian Games|Tri-Nation|Quadrangular|Emerging|Associate/i;
export function fame(q: { text: string; origin: string }) {
  const teams = new Set(q.text.match(MAJOR) ?? []).size;
  if (q.origin === "wikidata") return (teams ? 2 : 1) + (q.text.includes("but was born here") ? 2 : 0);
  if (q.origin !== "cricsheet") return 6;
  return (teams >= 2 ? 3 : teams === 1 ? 1 : -1) + (BIG.test(q.text) ? 2 : 0) - (MINOR.test(q.text) ? 2 : 0);
}

/**
 * Up to `n` live questions from one pool that none of `playerIds` has seen, best-known first (with some shuffle so
 * sessions vary). `exhausted` is true when fewer than `n` fresh questions were left.
 */
export async function freshFrom(pool: Pool, n: number, playerIds: string[]) {
  const db = await getDb();
  const excluded = [...(await seenBy(playerIds))];
  const where = and(eq(questions.pool, pool), eq(questions.status, "live"), excluded.length ? notInArray(questions.id, excluded) : undefined);
  const rows = await db.select({ id: questions.id, text: questions.text, origin: questions.origin }).from(questions).where(where);
  const ranked = rows.map((r) => ({ r, k: fame(r) + Math.random() * 3 })).sort((a, b) => b.k - a.k).map((x) => ({ id: x.r.id, text: x.r.text }));
  return { questions: ranked.slice(0, n), exhausted: rows.length < n, left: rows.length };
}

/** Fallback when a pool has too few fresh questions: best-known live ones from it, skipping `exclude`, repeats allowed. */
export async function bestFrom(pool: Pool, n: number, exclude: Set<string>) {
  const db = await getDb();
  const rows = await db.select({ id: questions.id, text: questions.text, origin: questions.origin }).from(questions).where(and(eq(questions.pool, pool), eq(questions.status, "live")));
  return rows.filter((r) => !exclude.has(r.id)).map((r) => ({ id: r.id, k: fame(r) + Math.random() * 3 })).sort((a, b) => b.k - a.k).slice(0, n).map((r) => r.id);
}
