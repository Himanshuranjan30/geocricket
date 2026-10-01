import { NextResponse } from "next/server";
import { MULTIPLIERS } from "@/lib/game";
import { freshFrom, markSeen } from "@/lib/seen";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

// Up to five Nets questions this player has never seen. Empty list = they've faced every ball in the pool.
export async function GET() {
  const pid = await playerId(true);
  const { questions, left } = await freshFrom("nets", MULTIPLIERS.length, pid ? [pid] : []);
  if (pid) await markSeen(pid, questions.map((q) => q.id), "nets");
  return NextResponse.json({ questions: questions.map((q, i) => ({ ...q, mult: MULTIPLIERS[i] })), exhausted: questions.length === 0, left: left - questions.length });
}
