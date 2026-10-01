import { NextResponse } from "next/server";
import { createGhostDuel } from "@/lib/ghost";
import { getProfile, playerId } from "@/lib/server";

// Start a Ghost Race: a recorded run from a finished round, ready to play as a duel.
export async function POST() {
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  const g = await createGhostDuel(pid);
  if ("none" in g) return NextResponse.json({ error: g.none === "all-seen"
    ? "You've played every finished round, so there's no ghost left to race. New ones arrive after each game closes."
    : "No ghosts yet: they come from finished rounds other players have played. Check back after tonight's games." }, { status: 404 });
  return NextResponse.json({ id: g.id });
}
