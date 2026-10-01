import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { istDate, QUESTION_SECONDS } from "@/lib/game";
import { markSeen } from "@/lib/seen";
import { getProfile, getRound, isLive, playerId } from "@/lib/server";

// Starts (or resumes) the shot clock for one question of a live round (today's daily or an open edition) and hands
// over its text. Returns the time left on the server's clock.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idx = Number(body?.idx);
  const key = String(body?.key ?? istDate());
  const round = await getRound(key);
  if (!round || !isLive(round)) return NextResponse.json({ error: "This round isn't open right now." }, { status: 404 });
  if (!Number.isInteger(idx) || idx < 0 || idx >= round.questions.length) return NextResponse.json({ error: "Invalid question." }, { status: 400 });
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile to play this round." }, { status: 403 });

  const db = await getDb();
  const { starts } = schema;
  await db.insert(starts).values({ playerId: pid, date: key, idx, startedMs: Date.now() }).onConflictDoNothing(); // first start wins
  const [row] = await db.select().from(starts).where(and(eq(starts.playerId, pid), eq(starts.date, key), eq(starts.idx, idx)));
  await markSeen(pid, [round.questions[idx].id], round.kind ?? "daily");
  const remainingMs = QUESTION_SECONDS * 1000 - (Date.now() - row.startedMs);
  return NextResponse.json({ id: round.questions[idx].id, text: round.questions[idx].text, remainingMs: Math.max(0, remainingMs), limitMs: QUESTION_SECONDS * 1000 });
}
