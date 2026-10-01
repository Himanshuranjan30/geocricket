import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { freshFrom, markSeen } from "@/lib/seen";
import { MULTIPLIERS } from "@/lib/game";
import { getProfile, openIds, playerId } from "@/lib/server";

// Create a friend challenge. Pass the 5 question ids you just played (Nets/archive) to challenge on the same balls,
// or nothing for a fresh set. Questions from live dailies/editions are refused so a duel can't leak them.
export async function POST(req: Request) {
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  const asked: unknown = (await req.json().catch(() => null))?.questionIds;
  let ids: string[];
  if (Array.isArray(asked) && asked.length === MULTIPLIERS.length && asked.every((x) => typeof x === "string")) {
    const open = await openIds();
    if (asked.some((id) => !open.has(id))) return NextResponse.json({ error: "Those questions aren't open for duels." }, { status: 403 });
    const real = await (await getDb()).select({ id: schema.questions.id }).from(schema.questions).where(inArray(schema.questions.id, asked));
    if (new Set(real.map((q) => q.id)).size !== new Set(asked).size) return NextResponse.json({ error: "Unknown question." }, { status: 400 });
    ids = asked;
  } else {
    ids = (await freshFrom("versus", MULTIPLIERS.length, [pid])).questions.map((q) => q.id);
  }
  if (ids.length < MULTIPLIERS.length) return NextResponse.json({ error: "Not enough questions available yet." }, { status: 503 });
  const id = crypto.randomUUID().slice(0, 8);
  const db = await getDb();
  await db.insert(schema.duels).values({ id, kind: "async", questionIds: ids, createdBy: pid, createdAt: Date.now() });
  await db.insert(schema.duelPlayers).values({ duelId: id, playerId: pid, joinedMs: Date.now() });
  await markSeen(pid, ids, "duel");
  return NextResponse.json({ id });
}
