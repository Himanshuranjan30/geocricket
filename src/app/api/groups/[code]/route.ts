import { NextResponse } from "next/server";
import { istDate, type Period } from "@/lib/game";
import { groupByCode, memberIds } from "@/lib/groups";
import { leaderboard, playerId } from "@/lib/server";

// Group leaderboard for a day, week or month. Anyone with the link can see it (so it previews nicely in WhatsApp).
export async function GET(req: Request, { params }: RouteContext<"/api/groups/[code]">) {
  const g = await groupByCode((await params).code);
  if (!g) return NextResponse.json({ error: "Group not found." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const p = sp.get("period");
  const period: Period = p === "week" || p === "month" ? p : "day";
  const members = await memberIds(g.id);
  const me = await playerId();
  const board = await leaderboard(sp.get("date") ?? istDate(), me, period, members);
  return NextResponse.json({ group: { code: g.code, name: g.name, members: members.size }, member: !!me && members.has(me), board });
}
