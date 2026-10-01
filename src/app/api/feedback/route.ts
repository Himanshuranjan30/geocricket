import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { playerId, sessionUser } from "@/lib/server";

const { feedback } = schema;
const KINDS = new Set(["bug", "idea", "other"]);
const PER_DAY = 10; // per player: plenty for real reports, a cap on spam

// A player's bug report or idea. Stored for the daily triage in /admin/feedback.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const kind = String(b?.kind ?? "");
  const message = String(b?.message ?? "").trim();
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Pick a type." }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: "Tell us a little more (at least 5 characters)." }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "Keep it under 2,000 characters." }, { status: 400 });
  const [pid, user] = await Promise.all([playerId(true), sessionUser()]);
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(feedback).where(and(eq(feedback.playerId, pid!), gt(feedback.createdMs, Date.now() - 86_400_000)));
  if (n >= PER_DAY) return NextResponse.json({ error: "Thanks! You've sent a lot today. Try again tomorrow." }, { status: 429 });
  await db.insert(feedback).values({
    id: randomUUID(), playerId: pid, email: user?.email ?? null, kind, message,
    page: String(b?.page ?? "").slice(0, 300) || null,
    device: `${(req.headers.get("user-agent") ?? "").slice(0, 300)} · ${String(b?.viewport ?? "").slice(0, 20)}`,
    createdMs: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
