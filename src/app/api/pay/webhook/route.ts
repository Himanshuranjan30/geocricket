import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { dodo } from "@/lib/dodo";
import { grant } from "@/lib/locker";

// Dodo webhook (Standard Webhooks signature). On payment.succeeded, grant the item of the matching order, once.
export async function POST(req: Request) {
  const body = await req.text();
  let event: { type: string; data: { payment_id?: string; total_amount?: number; metadata?: Record<string, string> } };
  try {
    event = dodo().webhooks.unwrap(body, {
      headers: {
        "webhook-id": req.headers.get("webhook-id") ?? "",
        "webhook-signature": req.headers.get("webhook-signature") ?? "",
        "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      },
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (event.type !== "payment.succeeded") return NextResponse.json({ received: true });

  const orderId = event.data.metadata?.order;
  if (!orderId) return NextResponse.json({ received: true });
  const db = await getDb();
  const { orders } = schema;
  const [order] = await db.update(orders).set({ status: "paid", paymentId: event.data.payment_id ?? null, amountPaise: event.data.total_amount ?? 0 })
    .where(and(eq(orders.id, orderId), eq(orders.status, "created"))).returning();
  if (order) await grant(order.playerId, order.itemId, "purchase");
  return NextResponse.json({ received: true });
}
