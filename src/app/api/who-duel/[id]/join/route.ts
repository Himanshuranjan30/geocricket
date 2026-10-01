import { NextResponse } from "next/server";
import { joinWho } from "@/lib/whoDuel";
import { getProfile, playerId } from "@/lib/server";

// Accept a friend's Name Race link.
export async function POST(_req: Request, { params }: RouteContext<"/api/who-duel/[id]/join">) {
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  return (await joinWho((await params).id, pid)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This match already has two players." }, { status: 409 });
}
