import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/jobs";
import { eveningPush } from "@/lib/maintenance";

export const maxDuration = 300;

// Vercel Cron, 13:00 UTC (6:30 PM IST; Hobby fires within the hour, so always after the 6 PM Evening Daily drop): streak at risk, else the Evening Daily going live (lib/maintenance.ts).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await eveningPush();
  return NextResponse.json(r, { status: r.ran && !r.ok ? 500 : 200 });
}
