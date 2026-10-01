import { NextResponse } from "next/server";
import { draftDaily } from "@/lib/generate";
import { cronAuthorized } from "@/lib/jobs";
import { dailyMaintenance } from "@/lib/maintenance";

export const maxDuration = 300;

// Vercel Cron, 20:30 UTC (~2 AM IST): the day's housekeeping (schedule, questions, Daily Cup, leagues), then AI drafts for review.
// Housekeeping also self-heals from the home pulse if this run is ever missed (lib/maintenance.ts).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const daily = await dailyMaintenance();
  const drafts = await draftDaily().catch((e) => ({ error: String(e) })); // drafting can fail without blocking the schedule
  return NextResponse.json({ daily, drafts }, { status: daily.ran && !daily.ok ? 500 : 200 });
}
