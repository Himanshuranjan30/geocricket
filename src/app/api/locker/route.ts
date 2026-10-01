import { NextResponse } from "next/server";
import { dodoEnabled } from "@/lib/dodo";
import { lockerFor } from "@/lib/locker";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const pid = await playerId();
  return NextResponse.json({ ...(await lockerFor(pid)), payments: dodoEnabled() });
}
