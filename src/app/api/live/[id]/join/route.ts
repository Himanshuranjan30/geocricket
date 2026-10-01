import { NextResponse } from "next/server";
import { joinLive } from "@/lib/duels";
import { getProfile, playerId } from "@/lib/server";

// Accept a friend's live 1v1 invite.
export async function POST(_req: Request, { params }: RouteContext<"/api/live/[id]/join">) {
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  const ok = await joinLive((await params).id, pid);
  return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "This duel already has two players." }, { status: 409 });
}
