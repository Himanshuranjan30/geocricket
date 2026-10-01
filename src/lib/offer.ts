import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, istDate } from "./game";

// One-time first-purchase offer: half price on your first legend, for 72h from when you first see it.
// Eligible: signed in, never bought anything, and has played the Daily on 3+ days. Discount code lives in Dodo (DODO_FIRST_DISCOUNT_CODE).
export const OFFER = { percent: 50, hours: 72 };

export async function offerFor(pid: string | null, signedIn: boolean) {
  if (!pid || !signedIn || !process.env.DODO_FIRST_DISCOUNT_CODE) return { eligible: false as const };
  const db = await getDb();
  const [p] = await db.select({ start: schema.players.offerStartMs }).from(schema.players).where(eq(schema.players.id, pid));
  const [bought] = await db.select({ id: schema.owned.itemId }).from(schema.owned).where(and(eq(schema.owned.playerId, pid), eq(schema.owned.via, "purchase"))).limit(1);
  if (bought) return { eligible: false as const };
  if (p?.start) {
    const endsMs = p.start + OFFER.hours * 3600e3;
    return endsMs > Date.now() ? { eligible: true as const, active: true, endsMs, percent: OFFER.percent } : { eligible: false as const };
  }
  const days = new Set((await db.select({ d: schema.scores.date }).from(schema.scores)
    .where(and(eq(schema.scores.playerId, pid), gte(schema.scores.date, addDays(istDate(), -60))))).map((r) => r.d).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).size;
  return days >= 3 ? { eligible: true as const, active: false, endsMs: null, percent: OFFER.percent } : { eligible: false as const };
}

/** Start the 72h clock (first time the offer is shown). */
export async function startOffer(pid: string) {
  const db = await getDb();
  const [p] = await db.select({ start: schema.players.offerStartMs }).from(schema.players).where(eq(schema.players.id, pid));
  if (!p?.start) await db.update(schema.players).set({ offerStartMs: Date.now() }).where(eq(schema.players.id, pid));
}
