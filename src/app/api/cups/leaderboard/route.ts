import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { SYSTEM_HOST } from "@/lib/cups";

export const dynamic = "force-dynamic";

// Cup leaderboards. Only cups that finished with 4+ signed-in players count; hosting counts when 8+ signed-in players
// finished it (max 3 hosted cups per host per day), so empty or guest-filled cups can't farm the boards.
export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period") ?? "all";
  const since = period === "week" ? Date.now() - 7 * 864e5 : period === "month" ? Date.now() - 30 * 864e5 : 0;
  const db = await getDb();
  const { cups, players } = schema;
  const done = await db.select({ winner: cups.winnerId, runnerUp: cups.runnerUpId, host: cups.hostId, signed: cups.signedIn, at: cups.finishedMs })
    .from(cups).where(and(eq(cups.status, "done"), gte(cups.finishedMs, since), gte(cups.signedIn, 4)));
  const wins = new Map<string, number>(), finals = new Map<string, number>(), hosted = new Map<string, number>(), perDay = new Map<string, number>();
  const add = (m: Map<string, number>, k: string | null) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
  for (const c of done) {
    add(wins, c.winner); add(finals, c.winner); add(finals, c.runnerUp);
    if (c.host !== SYSTEM_HOST && c.signed >= 8) {
      const day = `${c.host}:${new Date(c.at ?? 0).toISOString().slice(0, 10)}`;
      if ((perDay.get(day) ?? 0) < 3) { perDay.set(day, (perDay.get(day) ?? 0) + 1); add(hosted, c.host); }
    }
  }
  const ids = [...new Set([...wins.keys(), ...finals.keys(), ...hosted.keys()])];
  const who = ids.length ? await db.select({ id: players.id, handle: players.handle, avatar: players.avatar, country: players.country })
    .from(players).where(and(inArray(players.id, ids), isNotNull(players.userId))) : [];
  const rows = who.map((p) => ({ handle: p.handle ?? "player", avatar: p.avatar, country: p.country, wins: wins.get(p.id) ?? 0, finals: finals.get(p.id) ?? 0, hosted: hosted.get(p.id) ?? 0 }));
  const byCountry = new Map<string, { wins: number; hosted: number; players: number }>();
  for (const r of rows) if (r.country) {
    const c = byCountry.get(r.country) ?? { wins: 0, hosted: 0, players: 0 };
    c.wins += r.wins; c.hosted += r.hosted; c.players += 1; byCountry.set(r.country, c);
  }
  return NextResponse.json({
    players: rows.filter((r) => r.wins || r.finals).sort((a, b) => b.wins - a.wins || b.finals - a.finals).slice(0, 50).map((r, i) => ({ rank: i + 1, ...r })),
    hosts: rows.filter((r) => r.hosted).sort((a, b) => b.hosted - a.hosted).slice(0, 20).map((r, i) => ({ rank: i + 1, ...r })),
    countries: [...byCountry].map(([country, c]) => ({ country, ...c })).sort((a, b) => b.wins - a.wins || b.hosted - a.hosted).map((c, i) => ({ rank: i + 1, ...c })),
    period, cups: done.length,
  });
}
