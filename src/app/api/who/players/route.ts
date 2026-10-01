import { NextResponse } from "next/server";
import { whoPlayers } from "@/lib/who";

// The guess box's list: every player with an international moment in the database (not just today's answers).
export function GET() {
  return NextResponse.json(whoPlayers(), { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
