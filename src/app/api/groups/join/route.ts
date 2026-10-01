import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { groupByCode } from "@/lib/groups";
import { getProfile, playerId } from "@/lib/server";

// Join a group by invite code. Joining twice is a no-op.
export async function POST(req: Request) {
  const code = String((await req.json().catch(() => null))?.code ?? "");
  const g = await groupByCode(code);
  if (!g) return NextResponse.json({ error: "That invite code doesn't match a group." }, { status: 404 });
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  const db = await getDb();
  await db.insert(schema.groupMembers).values({ groupId: g.id, playerId: pid }).onConflictDoNothing();
  return NextResponse.json({ code: g.code, name: g.name });
}
