import { NextResponse } from "next/server";
import { leagueFor } from "@/lib/league";
import { playerId, sessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

// This week's league for the current player. Guests aren't in leagues (same as leaderboards).
export async function GET() {
  const [pid, user] = await Promise.all([playerId(), sessionUser()]);
  if (!pid || !user) return NextResponse.json({ guest: true });
  return NextResponse.json(await leagueFor(pid), { headers: { "cache-control": "no-store" } });
}
