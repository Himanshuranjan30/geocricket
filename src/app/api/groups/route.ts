import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { myGroups, newCode } from "@/lib/groups";
import { getProfile, playerId } from "@/lib/server";

// My groups.
export async function GET() {
  const pid = await playerId();
  return NextResponse.json({ groups: pid ? await myGroups(pid) : [] });
}

// Create a group (2–40 chars). The creator joins automatically; returns the invite code.
export async function POST(req: Request) {
  const name = String((await req.json().catch(() => null))?.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "Group names are 2–40 characters." }, { status: 400 });
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  const db = await getDb();
  const id = crypto.randomUUID(), code = newCode();
  await db.insert(schema.groups).values({ id, code, name, createdBy: pid });
  await db.insert(schema.groupMembers).values({ groupId: id, playerId: pid });
  return NextResponse.json({ code, name });
}
