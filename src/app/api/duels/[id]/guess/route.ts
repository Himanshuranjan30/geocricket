import { and, eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { duelQuestions } from "@/lib/duels";
import { distanceKm, MISS_KM, MULTIPLIERS, pointsFor } from "@/lib/game";
import { notify } from "@/lib/inbox";
import { addXp, getProfile, playerId, toAnswer } from "@/lib/server";

const { duels, duelPlayers, duelGuesses } = schema;

// Score one question of a friend challenge. Playing it joins you in. First guess per question counts.
export async function POST(req: Request, { params }: RouteContext<"/api/duels/[id]/guess">) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const idx = Number(body?.idx), timedOut = body?.timedOut === true, lat = Number(body?.lat), lng = Number(body?.lng);
  if (!Number.isInteger(idx) || idx < 0 || idx >= MULTIPLIERS.length) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  if (!timedOut && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 540)) return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });

  const db = await getDb();
  const [d] = await db.select().from(duels).where(eq(duels.id, id));
  if (!d || d.kind !== "async") return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  const q = (await duelQuestions(d.questionIds))[idx];
  const wrapped = timedOut ? 0 : ((((lng + 180) % 360) + 360) % 360) - 180;
  const km = timedOut ? MISS_KM : distanceKm([wrapped, lat], [q.lng, q.lat]);
  const points = timedOut ? 0 : pointsFor(km, q.scaleKm);

  await db.insert(duelPlayers).values({ duelId: id, playerId: pid, joinedMs: Date.now() }).onConflictDoNothing();
  const ins = await db.insert(duelGuesses).values({ duelId: id, playerId: pid, idx, lat: timedOut ? 0 : lat, lng: wrapped, points, km, atMs: Date.now() }).onConflictDoNothing().returning();
  if (ins.length) {
    await db.update(duelPlayers).set({ total: sql`${duelPlayers.total} + ${points * MULTIPLIERS[idx]}` }).where(and(eq(duelPlayers.duelId, id), eq(duelPlayers.playerId, pid)));
    // XP only for the first time you play a ball anywhere unscored (checks table): self-made duels on the same 5 balls can't farm XP.
    const first = await db.insert(schema.checks).values({ playerId: pid, questionId: q.id, points, atMs: Date.now() }).onConflictDoNothing().returning();
    if (first.length) after(() => addXp(pid, points * MULTIPLIERS[idx]).catch((e) => console.error("addXp", e)));
    // Friend finished your challenge: tell the challenger how it went.
    if (d.createdBy && d.createdBy !== pid) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(duelGuesses).where(and(eq(duelGuesses.duelId, id), eq(duelGuesses.playerId, pid)));
      if (n === MULTIPLIERS.length) {
        const rows = await db.select({ p: duelPlayers.playerId, total: duelPlayers.total }).from(duelPlayers).where(eq(duelPlayers.duelId, id));
        const mine = rows.find((r) => r.p === d.createdBy)?.total ?? 0, theirs = rows.find((r) => r.p === pid)?.total ?? 0;
        const who = (await getProfile(pid))?.handle ?? "Your friend";
        // A Ghost Race against your recorded run: a bell note only (a popular ghost would otherwise mean a lot of pushes).
        if (d.ghostOf) await notify(d.createdBy, { key: `duel-${id}-${pid}`, kind: "duel", url: `/duel/${id}`,
          title: theirs > mine ? `👻 @${who} raced your ghost and won, ${theirs} to ${mine}` : theirs < mine ? `👻 Your ghost beat @${who}, ${mine} to ${theirs}` : `👻 @${who} tied your ghost on ${mine}`,
          body: "They played your run from a past round. See the ball-by-ball." });
        else await notify(d.createdBy, { key: `duel-${id}-${pid}`, kind: "duel", url: `/duel/${id}`,
          title: theirs > mine ? `⚔️ @${who} beat you, ${theirs} to ${mine}` : theirs < mine ? `⚔️ You beat @${who}, ${mine} to ${theirs}` : `⚔️ You tied with @${who} on ${mine}`,
          body: "See the ball-by-ball and send a rematch." }, true);
      }
    }
  }
  const [stored] = await db.select().from(duelGuesses).where(and(eq(duelGuesses.duelId, id), eq(duelGuesses.playerId, pid), eq(duelGuesses.idx, idx)));
  // The challenger's ball on this question (always there for a ghost), shown next to yours once you've answered.
  const [theirs] = d.createdBy !== pid ? await db.select({ points: duelGuesses.points }).from(duelGuesses).where(and(eq(duelGuesses.duelId, id), eq(duelGuesses.playerId, d.createdBy), eq(duelGuesses.idx, idx))) : [];
  const rival = theirs ? { handle: (await getProfile(d.createdBy))?.handle ?? "rival", points: theirs.points } : null;
  return NextResponse.json({ points: stored.points, km: stored.km, mult: MULTIPLIERS[idx], answer: toAnswer(q), timedOut: stored.km >= MISS_KM, rival });
}
