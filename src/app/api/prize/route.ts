import { NextResponse } from "next/server";
import { claimPrize, prizeState } from "@/lib/prize";
import { playerId } from "@/lib/server";

// GET → today's prize, the latest winner and this player's prizes. POST { day, method, to, store? } → how to pay you.
export async function GET() {
  return NextResponse.json(await prizeState(await playerId()));
}

export async function POST(req: Request) {
  const pid = await playerId();
  const b = await req.json().catch(() => null);
  if (!pid || typeof b?.day !== "string" || typeof b?.method !== "string" || typeof b?.to !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const r = await claimPrize(pid, b.day, b.method, b.to, typeof b.store === "string" ? b.store : "");
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
