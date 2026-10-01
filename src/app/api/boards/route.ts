import { NextResponse } from "next/server";
import { board, BOARDS, mySummary, type BoardId } from "@/lib/boards";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

// GET ?board=ranking|points|who|accuracy|streak|effort|h2h|countries[&period=day|week|month][&limit=10]  → one board
// GET ?summary=1 → the viewer's standing on every board (lib/boards.ts)
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const me = await playerId();
  if (sp.get("summary")) return NextResponse.json(me ? await mySummary(me) : null, { headers: { "cache-control": "no-store" } });
  const id = (sp.get("board") ?? "ranking") as BoardId;
  if (!BOARDS.includes(id)) return NextResponse.json({ error: "Unknown board." }, { status: 400 });
  const p = sp.get("period");
  const period = p === "week" || p === "month" ? p : "day";
  const limit = Math.max(1, Math.min(100, Number(sp.get("limit")) || 10));
  return NextResponse.json(await board(id, me, { period, limit }), { headers: { "cache-control": "no-store" } });
}
