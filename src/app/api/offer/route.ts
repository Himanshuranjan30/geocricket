import { NextResponse } from "next/server";
import { offerFor, startOffer } from "@/lib/offer";
import { playerId, sessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [pid, user] = await Promise.all([playerId(), sessionUser()]);
  return NextResponse.json(await offerFor(pid, !!user));
}

// Called when the offer is first shown: starts its 72h countdown.
export async function POST() {
  const [pid, user] = await Promise.all([playerId(), sessionUser()]);
  const o = await offerFor(pid, !!user);
  if (pid && o.eligible && !o.active) await startOffer(pid);
  return NextResponse.json(await offerFor(pid, !!user));
}
