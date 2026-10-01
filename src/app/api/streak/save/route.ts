import { NextResponse } from "next/server";
import { addDays, istDate } from "@/lib/game";
import { grant } from "@/lib/locker";
import { playedDays, playerId, savedDays } from "@/lib/server";
import { saveable } from "@/lib/streak";

// Saves yesterday's missed day after the player watched a rewarded ad (client: StreakSaver). The Ad Placement API has no
// server-side verification, so the reward is capped by the rules instead: only yesterday, only once a week.
export async function POST() {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "No player." }, { status: 401 });
  const today = istDate();
  const [played, saved] = await Promise.all([playedDays(pid), savedDays(pid)]);
  const streak = saveable(played, saved, today);
  if (!streak) return NextResponse.json({ error: "Nothing to save." }, { status: 409 });
  await grant(pid, `save:${addDays(today, -1)}`, "reward");
  return NextResponse.json({ streak });
}
