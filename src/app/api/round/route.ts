import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { dropMs, istDate } from "@/lib/game";
import { finalizeScore, getRound, isLive, playerId, toAnswer } from "@/lib/server";

// A round by key: today's daily (default), a past daily (archive), or a Match Day / Test Match edition.
// While a round is live, a question's text is only revealed once it's been answered; the next one arrives with its
// shot clock (/api/start), so nobody can read ahead. Finished rounds are public.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const today = istDate();
  const key = sp.get("key") ?? sp.get("date") ?? today;
  if (!/^[a-z0-9-]{3,80}$/.test(key)) return NextResponse.json({ error: "No such round." }, { status: 404 });

  const round = await getRound(key);
  if (!round) return NextResponse.json({ error: "No round scheduled for that date." }, { status: 404 });
  const live = isLive(round);
  // Not open yet: a future day, today's Daily before 8 AM IST, or an edition before its window. Its questions stay secret.
  if (round.kind === "daily" ? key > today || (key === today && Date.now() < dropMs(key, "daily")) : !live && (round.opensMs ?? 0) > Date.now()) {
    return NextResponse.json({ error: round.kind === "daily" ? `Today's Daily opens at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(dropMs(key, "daily"))} IST.` : "That round hasn't opened yet.", opensMs: round.kind === "daily" ? dropMs(key, "daily") : round.opensMs }, { status: 404 });
  }

  let progress: { idx: number; lat: number; lng: number; points: number; km: number; answer: ReturnType<typeof toAnswer> }[] = [];
  const pid = await playerId();
  if (live && pid) {
    const db = await getDb();
    const rows = await db.select().from(schema.guesses).where(and(eq(schema.guesses.playerId, pid), eq(schema.guesses.date, key)));
    if (rows.length === round.questions.length) await finalizeScore(pid, round, rows); // heal a score lost to a failed last request
    progress = rows.map((g) => ({ idx: g.idx, lat: g.lat, lng: g.lng, points: g.points, km: g.km, answer: toAnswer(round.questions[g.idx]) }));
  }

  return NextResponse.json({
    date: key, key, kind: round.kind, title: round.title, number: round.number, daily: live, closesMs: round.closesMs,
    // Ids describe the answer ("kapil-1983-final"), so a live round only shows a ball's id and text once it's answered;
    // /api/start hands both over with the shot clock.
    questions: round.questions.map((q, i) => { const open = !live || progress.some((p) => p.idx === i); return { id: open ? q.id : `ball-${i + 1}`, mult: q.mult, text: open ? q.text : null }; }),
    progress: progress.sort((a, b) => a.idx - b.idx),
  });
}
