import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { findQuickLobby, joinLive } from "@/lib/duels";
import { getProfile, playerId } from "@/lib/server";

// Start a live 1v1. mode "quick": join a waiting stranger or open a lobby for one. mode "private": a lobby for a friend.
export async function POST(req: Request) {
  const mode = (await req.json().catch(() => null))?.mode === "private" ? "private" : "quick";
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });

  if (mode === "quick") {
    for (let i = 0; i < 3; i++) { // a lobby can be taken between find and join: try a couple
      const lobby = await findQuickLobby(pid);
      if (!lobby) break;
      if (await joinLive(lobby.id, pid)) return NextResponse.json({ id: lobby.id, matched: true });
    }
  }
  const id = crypto.randomUUID().slice(0, 8);
  const db = await getDb();
  await db.insert(schema.duels).values({ id, kind: "live", questionIds: [] /* picked at join time, so neither player has seen any */, createdBy: pid, quick: mode === "quick", createdAt: Date.now() });
  await db.insert(schema.duelPlayers).values({ duelId: id, playerId: pid, joinedMs: Date.now() });
  return NextResponse.json({ id, matched: false });
}
