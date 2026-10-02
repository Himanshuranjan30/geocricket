import { NextResponse } from "next/server";
import { playerId } from "@/lib/server";
import { challengeCandidates, hostChallenge, myChallenges } from "@/lib/who";

export const dynamic = "force-dynamic";

// Self-serve hosting (/mystery/host): the player picker plus your own challenges, and create one as yourself.
export async function GET() {
  const pid = await playerId();
  return NextResponse.json({ candidates: challengeCandidates(), mine: pid ? await myChallenges(pid) : [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Set up your player first.", needProfile: true }, { status: 403 });
  const b = await req.json().catch(() => null);
  const r = await hostChallenge(pid, { title: String(b?.title ?? ""), players: Array.isArray(b?.players) ? b.players.map(String) : [] });
  return "error" in r ? NextResponse.json(r, { status: "needProfile" in r ? 403 : 400 }) : NextResponse.json(r);
}
