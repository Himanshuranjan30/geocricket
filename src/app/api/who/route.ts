import { NextResponse } from "next/server";
import { istDate } from "@/lib/game";
import { playerId } from "@/lib/server";
import { whoView } from "@/lib/who";

export const dynamic = "force-dynamic";

// Today's (or a past day's, e.g. from a friend's "beat my Who" link, vs=<their code>) Who's the Player? state for this player: earned clues only, answers once a puzzle is over.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ?? istDate(), vs = sp.get("vs");
  const view = await whoView(await playerId(), date, vs && /^[a-f0-9]{10}$/.test(vs) ? vs : null);
  if (!view) return NextResponse.json({ error: "No puzzle for that day." }, { status: 404 });
  return NextResponse.json(view, { headers: { "cache-control": "no-store" } });
}
