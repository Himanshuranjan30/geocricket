import { NextResponse } from "next/server";
import { deadline, duelQuestions, duelRoster, guessesFor, roundMult, tickLive, toAnswer } from "@/lib/duels";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { roundCount, roundName } from "@/lib/cup";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

// Live 1v1 view, polled about once a second. Advances the duel, then returns only what this player may see:
// the current question once it opens, whether the opponent has guessed (not where), and full results once a round ends.
export async function GET(_req: Request, { params }: RouteContext<"/api/live/[id]">) {
  const { id } = await params;
  const d = await tickLive(id);
  if (!d || (d.kind !== "live" && d.kind !== "cup")) return NextResponse.json({ error: "Duel not found." }, { status: 404 });
  const [me, roster, gs, qs] = await Promise.all([playerId(), duelRoster(id), guessesFor(id), duelQuestions(d.questionIds)]);
  // Presence: a cup player who never opens their match loses by walkover (lib/cup.ts), so record that they're here.
  if (me && d.kind === "cup" && roster.some((p) => p.playerId === me)) {
    const db = await getDb();
    await db.update(schema.duelPlayers).set({ lastSeenMs: Date.now() }).where(and(eq(schema.duelPlayers.duelId, id), eq(schema.duelPlayers.playerId, me)));
  }
  const cup = d.cupId ? await getDb().then((db) => db.select({ code: schema.cups.code, name: schema.cups.name, state: schema.cups.state }).from(schema.cups).where(eq(schema.cups.id, d.cupId!))).then((r) => r[0]) : null;
  const cupInfo = cup ? { code: cup.code, name: cup.name, round: cup.state.rounds.length ? roundName(d.cupRound ?? 0, roundCount(cup.state.rounds[0].length * 2)) : "" } : null;
  const now = Date.now();
  // Player ids double as login cookies, so never send them: players become slots "p0"/"p1" in join order.
  const slot = new Map(roster.map((p, i) => [p.playerId, `p${i}`]));
  const S = (pid: string | null) => (pid && slot.get(pid)) ?? pid; // "draw" passes through
  const keyed = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [S(k), v]));
  const players = roster.map((p) => ({ slot: S(p.playerId), me: p.playerId === me, handle: p.handle ?? "anonymous", avatar: p.avatar ?? `anon${slot.get(p.playerId)}`, country: p.country }));
  const s = d.state;
  if (!s) return NextResponse.json({ status: d.status, players, now, cup: cupInfo });

  const round = s.round, q = qs[round];
  const open = now >= s.openMs;
  const resolved = s.resolvedMs != null;
  const roundGuesses = gs.filter((g) => g.idx === round);
  const mine = roundGuesses.find((g) => g.playerId === me);
  return NextResponse.json({
    status: d.status, players, now, cup: cupInfo, hp: keyed(s.hp), winner: S(s.winner),
    log: s.log.map((l) => ({ ...l, loser: S(l.loser), points: keyed(l.points) })),
    round: {
      n: round, mult: roundMult(round), openMs: s.openMs, deadlineMs: Number.isFinite(deadline(s)) ? deadline(s) : null,
      firstGuessMs: s.firstGuessMs, resolvedMs: s.resolvedMs,
      text: open ? q.text : null,
      myGuess: mine ? { lat: mine.lat, lng: mine.lng, points: mine.points } : null,
      guessed: roundGuesses.map((g) => S(g.playerId)),
      result: resolved ? { answer: toAnswer(q), guesses: roundGuesses.map((g) => ({ slot: S(g.playerId), lat: g.lat, lng: g.lng, points: g.points, km: g.km })) } : null,
    },
  });
}
