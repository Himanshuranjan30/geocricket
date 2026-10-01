import { markSeen } from "@/lib/seen";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { duelQuestions, duelRoster, guessesFor } from "@/lib/duels";
import { MULTIPLIERS } from "@/lib/game";
import { playerId, toAnswer } from "@/lib/server";

// A friend challenge: the 5 questions, everyone who's played, and their per-question points.
export async function GET(_req: Request, { params }: RouteContext<"/api/duels/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const [d] = await db.select().from(schema.duels).where(eq(schema.duels.id, id));
  if (!d || d.kind !== "async") return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  const [qs, roster, gs, me] = await Promise.all([duelQuestions(d.questionIds), duelRoster(id), guessesFor(id), playerId()]);
  if (me) await markSeen(me, d.questionIds, "duel");
  const mine = gs.filter((g) => g.playerId === me);
  return NextResponse.json({
    id,
    ghost: d.ghostOf, // Ghost Race: the finished round the creator's run comes from
    questions: qs.map((q, i) => ({ id: q.id, text: q.text, mult: MULTIPLIERS[i] })),
    players: roster.map((p) => {
      const g = gs.filter((x) => x.playerId === p.playerId);
      return {
        me: p.playerId === me, creator: p.playerId === d.createdBy, handle: p.handle ?? "anonymous", avatar: p.avatar ?? "anon", country: p.country,
        total: p.total, played: g.length, done: g.length === qs.length,
        points: qs.map((_, i) => g.find((x) => x.idx === i)?.points ?? null),
      };
    }),
    progress: mine.map((g) => {
      const theirs = me !== d.createdBy ? gs.find((x) => x.playerId === d.createdBy && x.idx === g.idx) : undefined;
      return { idx: g.idx, lat: g.lat, lng: g.lng, points: g.points, km: g.km, answer: toAnswer(qs[g.idx]), rival: theirs ? { handle: roster.find((p) => p.playerId === d.createdBy)?.handle ?? "rival", points: theirs.points } : null };
    }),
  });
}
