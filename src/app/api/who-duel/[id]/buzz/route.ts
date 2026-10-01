import { NextResponse } from "next/server";
import { whoBuzz } from "@/lib/whoDuel";
import { playerId } from "@/lib/server";

// Name the player for the current round. The server's clock decides the clue, the lockout and who was first.
export async function POST(req: Request, { params }: RouteContext<"/api/who-duel/[id]/buzz">) {
  const body = await req.json().catch(() => null);
  const round = Number(body?.round), pick = typeof body?.pick === "string" ? body.pick : "";
  if (!Number.isInteger(round) || !pick) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "You're not in this match." }, { status: 403 });
  const r = await whoBuzz((await params).id, pid, round, pick);
  return "error" in r ? NextResponse.json({ error: r.error, locked: "locked" in r }, { status: r.status }) : NextResponse.json(r);
}
