import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/jobs";
import { morningBrief } from "@/lib/maintenance";

export const maxDuration = 300;

// Vercel Cron, 03:00 UTC (8:30 AM IST; Hobby fires within the hour, so always after the 8 AM Morning Test drop): yesterday's result + today's games, as one push per subscribed player.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await morningBrief();
  return NextResponse.json(r, { status: r.ran && !r.ok ? 500 : 200 });
}
