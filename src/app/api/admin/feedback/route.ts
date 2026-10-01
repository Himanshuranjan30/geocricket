import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { isAdmin } from "@/lib/admin";

const { feedback, players } = schema;
const deny = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

// Latest 200 reports (newest first) with the player's handle; ?status=new|seen|done filters.
export async function GET(req: Request) {
  if (!(await isAdmin())) return deny();
  const status = new URL(req.url).searchParams.get("status");
  const db = await getDb();
  const rows = await db.select({ id: feedback.id, kind: feedback.kind, message: feedback.message, page: feedback.page, device: feedback.device, status: feedback.status,
    createdMs: feedback.createdMs, email: feedback.email, handle: players.handle })
    .from(feedback).leftJoin(players, eq(players.id, feedback.playerId))
    .where(status ? eq(feedback.status, status) : undefined).orderBy(desc(feedback.createdMs)).limit(200);
  return NextResponse.json({ items: rows });
}

// { ids: string[], status: "new" | "seen" | "done" }
export async function POST(req: Request) {
  if (!(await isAdmin())) return deny();
  const b = await req.json().catch(() => null);
  const ids = Array.isArray(b?.ids) ? b.ids.map(String).slice(0, 200) : [];
  if (!ids.length || !["new", "seen", "done"].includes(b?.status)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const db = await getDb();
  await db.update(feedback).set({ status: b.status }).where(inArray(feedback.id, ids));
  return NextResponse.json({ ok: true });
}
