import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { dodo, dodoEnabled } from "@/lib/dodo";
import { grant } from "@/lib/locker";
import { playerId } from "@/lib/server";

// Asks Dodo directly whether this player's open orders were paid, and grants them. Works with or without the webhook
// (the webhook covers closed tabs; this covers environments where Dodo can't reach us, like protected staging).
export async function POST() {
  const pid = await playerId();
  if (!pid || !dodoEnabled()) return NextResponse.json({ granted: [] });
  const db = await getDb();
  const { orders } = schema;
  const open = await db.select().from(orders).where(and(eq(orders.playerId, pid), eq(orders.status, "created")));
  const granted: string[] = [];
  for (const o of open.filter((x) => Date.now() - x.createdMs < 24 * 3600e3 && x.paymentId?.startsWith("cks_"))) {
    const s = await dodo().checkoutSessions.retrieve(o.paymentId!).catch(() => null);
    if (s?.payment_status !== "succeeded") continue;
    const [won] = await db.update(orders).set({ status: "paid", paymentId: s.payment_id ?? o.paymentId })
      .where(and(eq(orders.id, o.id), eq(orders.status, "created"))).returning();
    if (won) { await grant(pid, o.itemId, "purchase"); granted.push(o.itemId); }
  }
  return NextResponse.json({ granted });
}
