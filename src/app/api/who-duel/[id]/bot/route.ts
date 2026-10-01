import { NextResponse } from "next/server";
import { startBot } from "@/lib/whoDuel";
import { playerId } from "@/lib/server";

// The lobby's creator gave up waiting: play the bot in this match instead.
export async function POST(_req: Request, { params }: RouteContext<"/api/who-duel/[id]/bot">) {
  const pid = await playerId();
  return pid && (await startBot((await params).id, pid)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Couldn't start that match." }, { status: 409 });
}
