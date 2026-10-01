import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Elo skill rating (starts at 1200) from live 1v1 and cup matches. Only matches between two signed-in players count,
// so guest throwaways can't pump a rating. Used to seed cups; shown to players as a tier.
const K = 32;
export const expected = (ra: number, rb: number) => 1 / (1 + 10 ** ((rb - ra) / 400));
export const eloDelta = (ra: number, rb: number, aWon: boolean) => Math.round(K * ((aWon ? 1 : 0) - expected(ra, rb)));

export async function rateMatch(a: string, b: string, winner: string) {
  const db = await getDb();
  const rows = await db.select({ id: schema.players.id, rating: schema.players.rating, userId: schema.players.userId }).from(schema.players).where(inArray(schema.players.id, [a, b]));
  const pa = rows.find((r) => r.id === a), pb = rows.find((r) => r.id === b);
  if (!pa?.userId || !pb?.userId || (winner !== a && winner !== b)) return;
  const d = eloDelta(pa.rating, pb.rating, winner === a);
  await Promise.all([
    db.update(schema.players).set({ rating: pa.rating + d }).where(eq(schema.players.id, a)),
    db.update(schema.players).set({ rating: pb.rating - d }).where(eq(schema.players.id, b)),
  ]);
}

export const ratingTier = (r: number) => (r >= 1600 ? "Legend" : r >= 1450 ? "International" : r >= 1300 ? "State" : "Club");
