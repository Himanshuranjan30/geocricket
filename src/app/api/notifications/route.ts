import { NextResponse } from "next/server";
import { inboxFor, markRead } from "@/lib/inbox";
import { playerId, sessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [pid, user] = await Promise.all([playerId(), sessionUser()]);
  if (!pid) return NextResponse.json({ items: [], unread: 0 });
  return NextResponse.json(await inboxFor(pid, !!user));
}

// { ids?: string[] } — mark those (or everything) read.
export async function POST(req: Request) {
  const pid = await playerId();
  const ids = (await req.json().catch(() => null))?.ids;
  if (pid) await markRead(pid, Array.isArray(ids) ? ids.map(String).slice(0, 50) : undefined);
  return NextResponse.json({ ok: true });
}
