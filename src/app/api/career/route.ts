import { NextResponse } from "next/server";
import { careerFor } from "@/lib/career";
import { notifyNewBadges } from "@/lib/inbox";
import { getProfile, playerId, sessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [pid, user] = await Promise.all([playerId(), sessionUser()]);
  if (!pid) return NextResponse.json({ error: "No player yet." }, { status: 404 });
  const [career, profile] = await Promise.all([careerFor(pid, !!user), getProfile(pid)]);
  if (user) await notifyNewBadges(pid, career.badges);
  return NextResponse.json({ ...career, profile });
}
