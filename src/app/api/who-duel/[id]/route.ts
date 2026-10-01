import { NextResponse } from "next/server";
import { whoDuelView } from "@/lib/whoDuel";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

// Name Race view, polled about once a second (and on each clue's landing time). Advances the match first.
export async function GET(_req: Request, { params }: RouteContext<"/api/who-duel/[id]">) {
  const v = await whoDuelView((await params).id, await playerId());
  return v ? NextResponse.json(v, { headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: "Match not found." }, { status: 404 });
}
