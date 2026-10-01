import { NextResponse } from "next/server";
import { createWhoDuel, findWhoLobby, joinWho } from "@/lib/whoDuel";
import { getProfile, playerId } from "@/lib/server";

// Start a Name Race. "quick": join a waiting stranger or open a lobby for one (a bot steps in if nobody comes).
// "private": a lobby for a friend's link. "bot": play the bot now.
export async function POST(req: Request) {
  const m = (await req.json().catch(() => null))?.mode;
  const mode = m === "private" || m === "bot" ? m : "quick";
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  if (mode === "quick") {
    for (let i = 0; i < 3; i++) { // a lobby can be taken between find and join: try a couple
      const lobby = await findWhoLobby(pid);
      if (!lobby) break;
      if (await joinWho(lobby.id, pid)) return NextResponse.json({ id: lobby.id, matched: true });
    }
  }
  return NextResponse.json({ id: await createWhoDuel(pid, mode), matched: mode === "bot" });
}
