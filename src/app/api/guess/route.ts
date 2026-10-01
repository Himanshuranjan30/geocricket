import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { distanceKm, GRACE_MS, istDate, MISS_KM, pointsFor, QUESTION_SECONDS } from "@/lib/game";
import { testBallXp } from "@/lib/level";
import { addXp, finalizeScore, getProfile, getRound, isLive, playerId, toAnswer } from "@/lib/server";

const { guesses, starts } = schema;

// Scores one question of a live round (today's daily or an open edition) on the server. First guess per question counts; repeats return the stored result.
// Guesses after the shot clock (+ grace) or sent as timedOut score 0.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idx = Number(body?.idx);
  const key = String(body?.key ?? istDate());
  const timedOut = body?.timedOut === true;
  const lat = Number(body?.lat), lng = Number(body?.lng);
  const date = key;
  const round = await getRound(date);
  if (!round) return NextResponse.json({ error: "This round isn't open right now." }, { status: 404 });
  const n = round.questions.length;
  if (!Number.isInteger(idx) || idx < 0 || idx >= n) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  if (!timedOut && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 540)) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile to play the daily round." }, { status: 403 });

  const db = await getDb();
  // Server-side shot clock: time is measured from when the question was first served, never from the client.
  const [start] = await db.select().from(starts).where(and(eq(starts.playerId, pid), eq(starts.date, date), eq(starts.idx, idx)));
  // Closed rounds only take the answer to a ball whose clock started while the round was open (midnight edge).
  if (!isLive(round) && !(start && isLive(round, start.startedMs) && Date.now() - start.startedMs <= QUESTION_SECONDS * 1000 + GRACE_MS)) {
    return NextResponse.json({ error: "This round isn't open right now." }, { status: 404 });
  }
  if (!start) return NextResponse.json({ error: "That question hasn't started yet." }, { status: 409 });
  const elapsed = Date.now() - start.startedMs;
  const late = elapsed > QUESTION_SECONDS * 1000 + GRACE_MS;
  const ms = Math.min(elapsed, QUESTION_SECONDS * 1000);

  const q = round.questions[idx];
  const miss = timedOut || late;
  const wrapped = miss ? 0 : ((((lng + 180) % 360) + 360) % 360) - 180;
  const km = miss ? MISS_KM : distanceKm([wrapped, lat], [q.lng, q.lat]);
  const points = miss ? 0 : pointsFor(km, q.scaleKm);

  const inserted = await db.insert(guesses).values({ playerId: pid, date, idx, lat: miss ? 0 : lat, lng: wrapped, points, km, ms }).onConflictDoNothing().returning();
  // Only the first (counted) guess earns XP. Test Matches are higher stakes: ×2 for a good ball, a penalty for a poor one.
  const xp = round.kind === "test" ? testBallXp(points, q.mult) : points * q.mult;
  // XP, league and level-up notes run after the response, so the player sees their result without waiting on them.
  if (inserted.length) after(() => addXp(pid, xp).catch((e) => console.error("addXp", e)));
  const mine = await db.select().from(guesses).where(and(eq(guesses.playerId, pid), eq(guesses.date, date)));
  const stored = mine.find((g) => g.idx === idx)!;

  if (mine.length === n) await finalizeScore(pid, round, mine);

  return NextResponse.json({
    xp: inserted.length ? xp : 0, test: round.kind === "test",
    points: stored.points, km: stored.km, mult: q.mult, answer: toAnswer(q), done: mine.length === n,
    timedOut: stored.km >= MISS_KM, late,
  });
}
