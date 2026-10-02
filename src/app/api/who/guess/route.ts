import { after, NextResponse } from "next/server";
import { addXp, playerId } from "@/lib/server";
import { bustBoards } from "@/lib/boards";
import { saveWhoResult, whoGuess, whoView } from "@/lib/who";

export const dynamic = "force-dynamic";

// One guess (pick = player id) or skip (pick = null) on puzzle `idx`. Returns the fresh day state so the page never
// has to reconcile two sources of truth. Guests can play: a player cookie is created on the first guess.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : "";
  const idx = Number(body?.idx);
  const pick = typeof body?.pick === "string" ? body.pick : null;
  const at = Number.isInteger(body?.step) ? (body.step as number) : undefined; // the clue the player was on
  const pid = await playerId(true);
  if (!pid) return NextResponse.json({ error: "Couldn't start your game. Refresh and try again." }, { status: 500 });
  const res = await whoGuess(pid, date, idx, pick, at);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  const view = await whoView(pid, date);
  if (view?.finished) {
    const steps = view.items.map((i) => i.solvedAt);
    // Saved before replying so the streak, boards and percentile the summary fetches next already include this day.
    // Creator challenges pay half XP (they're extra play, not the daily) and don't touch the boards.
    if (await saveWhoResult(pid, date, steps, view.total)) { if (!view.challenge) bustBoards(); after(() => addXp(pid, Math.round(view.total / (view.challenge ? 20 : 10)))); }
  }
  return NextResponse.json({ correct: "correct" in res ? res.correct : undefined, view });
}
