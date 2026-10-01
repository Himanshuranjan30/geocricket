import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { CUP } from "@/lib/cup";
import { cupByCode, cupView, joinCup, leaveCup, tickCup, touch } from "@/lib/cups";
import { getProfile, playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

// A cup's live view, polled every ~2 s by its page. Being here counts as checked in.
export async function GET(_req: Request, { params }: RouteContext<"/api/cups/[code]">) {
  const cup = await cupByCode((await params).code);
  if (!cup) return NextResponse.json({ error: "Cup not found." }, { status: 404 });
  const pid = await playerId();
  if (pid) await touch(cup.id, pid);
  return NextResponse.json(await cupView(await tickCup(cup), pid));
}

// join | leave | start (host: now, if 4+ are here) | edit (host, before check-in: name, start time, size)
export async function POST(req: Request, { params }: RouteContext<"/api/cups/[code]">) {
  const cup = await cupByCode((await params).code);
  if (!cup) return NextResponse.json({ error: "Cup not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  const pid = await playerId(true);
  if (!pid) return NextResponse.json({ error: "Create your player first." }, { status: 403 });
  const db = await getDb();

  if (action === "join") {
    if (!(await getProfile(pid))) return NextResponse.json({ error: "Create your player first." }, { status: 403 });
    const r = await joinCup(cup, pid);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  if (action === "leave") {
    const r = await leaveCup(cup, pid);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  if (cup.hostId !== pid) return NextResponse.json({ error: "Only the host can do that." }, { status: 403 });
  const s = cup.state;

  if (action === "start") {
    if (s.phase !== "lobby" && s.phase !== "checkin") return NextResponse.json({ error: "Already started." }, { status: 409 });
    const now = Date.now();
    const [{ here }] = await db.select({ here: sql<number>`count(*)::int` }).from(schema.cupEntrants)
      .where(and(eq(schema.cupEntrants.cupId, cup.id), sql`${schema.cupEntrants.lastSeenMs} > ${now - 60_000}`));
    if (here < CUP.MIN_PLAYERS) return NextResponse.json({ error: `Need ${CUP.MIN_PLAYERS} players in the lobby to start (${here} here).` }, { status: 409 });
    // Start = now: check-in counts everyone seen in the last 10 minutes, which covers the lobby.
    const next = { ...s, v: s.v + 1, phase: "checkin" as const, startsMs: now };
    const ok = await db.update(schema.cups).set({ state: next, status: "checkin", startsMs: now }).where(and(eq(schema.cups.id, cup.id), sql`(${schema.cups.state}->>'v')::int = ${s.v}`)).returning();
    if (!ok.length) return NextResponse.json({ error: "Something changed, try again." }, { status: 409 });
    await tickCup(ok[0]);
    return NextResponse.json({ ok: true });
  }
  if (action === "edit") {
    if (s.phase !== "lobby") return NextResponse.json({ error: "You can only edit before check-in opens." }, { status: 409 });
    const patch: Partial<typeof cup> = {};
    let startsMs = s.startsMs;
    if (body?.name != null) { const n = String(body.name).replace(/\s+/g, " ").trim(); if (n.length < 3 || n.length > 40) return NextResponse.json({ error: "Name: 3–40 characters." }, { status: 400 }); patch.name = n; }
    if (body?.startsMs != null) { startsMs = Number(body.startsMs); if (!(startsMs >= Date.now() + 60_000 && startsMs <= Date.now() + 7 * 864e5)) return NextResponse.json({ error: "Start time must be 1 minute to 7 days away." }, { status: 400 }); }
    if (body?.capacity != null) {
      const c = Number(body.capacity);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.cupEntrants).where(eq(schema.cupEntrants.cupId, cup.id));
      if (!(CUP.SIZES as readonly number[]).includes(c) || c < n) return NextResponse.json({ error: `Size must be 4/8/16/32 and fit the ${n} players in.` }, { status: 400 });
      patch.capacity = c;
    }
    const ok = await db.update(schema.cups).set({ ...patch, startsMs, state: { ...s, v: s.v + 1, startsMs } })
      .where(and(eq(schema.cups.id, cup.id), sql`(${schema.cups.state}->>'v')::int = ${s.v}`)).returning();
    return ok.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Something changed, try again." }, { status: 409 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
