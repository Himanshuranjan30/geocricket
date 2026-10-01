import { NextResponse } from "next/server";
import { istDate } from "@/lib/game";
import { leaderboard, playerId } from "@/lib/server";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ?? istDate();
  const period = sp.get("period") ?? "day";
  // A date (daily board, any period) or a round key (Test Match, evening Daily, Match Day: that round's board only).
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!dated && !/^[a-z0-9-]{3,80}$/.test(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });
  if (period !== "day" && period !== "week" && period !== "month") return NextResponse.json({ error: "Period must be day, week or month." }, { status: 400 });
  return NextResponse.json(await leaderboard(date, await playerId(), dated ? period : "day"));
}
