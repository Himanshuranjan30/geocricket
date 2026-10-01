import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { deadline, duelQuestions, markFirstGuess, tickLive } from "@/lib/duels";
import { duelPoints } from "@/lib/live";
import { distanceKm, pointsFor } from "@/lib/game";
import { addXp, playerId } from "@/lib/server";

// Lock in a guess for the current live round. The server decides whether the round is still open.
export async function POST(req: Request, { params }: RouteContext<"/api/live/[id]/guess">) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const round = Number(body?.round), lat = Number(body?.lat), lng = Number(body?.lng);
  if (!Number.isInteger(round) || !(Math.abs(lat) <= 90 && Math.abs(lng) <= 540)) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  const pid = await playerId();
  const d = await tickLive(id);
  if (!d?.state || d.status !== "playing") return NextResponse.json({ error: "This duel isn't running." }, { status: 409 });
  const db = await getDb();
  const seated = await db.select().from(schema.duelPlayers).where(eq(schema.duelPlayers.duelId, id));
  if (!pid || !seated.some((p) => p.playerId === pid)) return NextResponse.json({ error: "You're not in this duel." }, { status: 403 });
  const now = Date.now(), s = d.state;
  if (round !== s.round || s.resolvedMs != null || now < s.openMs || now > deadline(s)) return NextResponse.json({ error: "Too late for that round." }, { status: 409 });

  const q = (await duelQuestions(d.questionIds))[round];
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  const km = distanceKm([wrapped, lat], [q.lng, q.lat]);
  const points = duelPoints(km); // duel damage scale; XP stays on the normal 0–100 scale
  const ins = await db.insert(schema.duelGuesses).values({ duelId: id, playerId: pid, idx: round, lat, lng: wrapped, points, km, atMs: now }).onConflictDoNothing().returning();
  if (ins.length) {
    await markFirstGuess(id, s, now);
    const first = await (await getDb()).insert(schema.checks).values({ playerId: pid, questionId: q.id, points: pointsFor(km, q.scaleKm), atMs: now }).onConflictDoNothing().returning();
    if (first.length) await addXp(pid, pointsFor(km, q.scaleKm)); // XP once per ball, so two accounts can't farm each other
  }
  await tickLive(id); // resolves immediately if both have now guessed
  return NextResponse.json({ ok: true });
}
