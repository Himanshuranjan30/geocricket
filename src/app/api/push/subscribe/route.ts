import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { pushEnabled } from "@/lib/push";
import { playerId } from "@/lib/server";

// Save (POST) or remove (DELETE) this browser's push subscription for the current player.
export async function POST(req: Request) {
  const sub = (await req.json().catch(() => null))?.subscription;
  const endpoint = String(sub?.endpoint ?? ""), p256dh = String(sub?.keys?.p256dh ?? ""), auth = String(sub?.keys?.auth ?? "");
  if (!pushEnabled() || !endpoint.startsWith("https://") || !p256dh || !auth) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  const pid = (await playerId(true))!;
  const db = await getDb();
  await db.insert(schema.pushSubs).values({ endpoint, playerId: pid, p256dh, auth, createdMs: Date.now() })
    .onConflictDoUpdate({ target: schema.pushSubs.endpoint, set: { playerId: pid, p256dh, auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const endpoint = String((await req.json().catch(() => null))?.endpoint ?? "");
  const pid = await playerId();
  if (pid && endpoint) { const db = await getDb(); await db.delete(schema.pushSubs).where(and(eq(schema.pushSubs.endpoint, endpoint), eq(schema.pushSubs.playerId, pid))); }
  return NextResponse.json({ ok: true });
}
