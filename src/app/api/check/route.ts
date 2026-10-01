import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { distanceKm, MISS_KM, pointsFor } from "@/lib/game";
import { markSeen } from "@/lib/seen";
import { addXp, openIds, playerId, toAnswer } from "@/lib/server";

// Unscored check for Practice and Archive. Refuses questions from today's or future dailies.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? ""), lat = Number(body?.lat), lng = Number(body?.lng);
  const timedOut = body?.timedOut === true; // practice shot clock ran out with no ball placed
  if (!id || (!timedOut && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 540))) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  if (!(await openIds()).has(id)) return NextResponse.json({ error: "That question isn't open for practice." }, { status: 403 });

  const db = await getDb();
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.id, id));
  if (!q) return NextResponse.json({ error: "Unknown question." }, { status: 404 });
  const wrapped = timedOut ? 0 : ((((lng + 180) % 360) + 360) % 360) - 180;
  const km = timedOut ? MISS_KM : distanceKm([wrapped, lat], [q.lng, q.lat]);
  const points = timedOut ? 0 : pointsFor(km, q.scaleKm);
  const pid = await playerId();
  let xp = 0;
  if (pid) {
    await markSeen(pid, [id], "check"); // archive balls count as seen, so Ghost Race never serves a round you've played
    // First check per ball earns XP (cosmetic, and half league XP); replays don't, so the archive can't be farmed.
    const first = await db.insert(schema.checks).values({ playerId: pid, questionId: id, points, atMs: Date.now() }).onConflictDoNothing().returning();
    if (first.length && points) { xp = points; after(() => addXp(pid, points, { league: 0.5 }).catch((e) => console.error("addXp", e))); }
  }
  return NextResponse.json({ points, km, answer: toAnswer(q), xp, ...(timedOut ? { timedOut: true } : {}) });
}
