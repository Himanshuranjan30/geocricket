import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { playerId } from "@/lib/server";

// The player confirms they're 18 or older (GeoCricket is 18+). Recorded once; required before any purchase.
export async function POST(req: Request) {
  if ((await req.json().catch(() => null))?.adult !== true) return NextResponse.json({ error: "Confirm you're 18 or older." }, { status: 400 });
  const pid = await playerId(true);
  if (!pid) return NextResponse.json({ error: "No player." }, { status: 400 });
  const db = await getDb();
  await db.update(schema.players).set({ ageConfirmedMs: Date.now() }).where(eq(schema.players.id, pid));
  return NextResponse.json({ ok: true });
}
