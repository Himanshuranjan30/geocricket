import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { isAdmin } from "@/lib/admin";

const { questions } = schema;
const deny = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

export async function GET() {
  if (!(await isAdmin())) return deny();
  const db = await getDb();
  return NextResponse.json({ drafts: await db.select().from(questions).where(eq(questions.status, "pending")).orderBy(desc(questions.createdAt)) });
}

// { id, action: "approve" | "reject", edits?: { text, answer, when, story, pool, lat, lng } }
export async function POST(req: Request) {
  if (!(await isAdmin())) return deny();
  const b = await req.json().catch(() => null);
  const id = String(b?.id ?? "");
  const db = await getDb();
  if (b?.action === "reject") { await db.update(questions).set({ status: "rejected" }).where(eq(questions.id, id)); return NextResponse.json({ ok: true }); }
  if (b?.action !== "approve") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const e = b.edits ?? {};
  const set: Partial<typeof questions.$inferInsert> = { status: "live" };
  for (const k of ["text", "answer", "when", "story"] as const) if (typeof e[k] === "string" && e[k].trim()) set[k] = e[k].trim();
  if (e.pool === "nets" || e.pool === "versus" || e.pool === "edition") set.pool = e.pool;
  if (Math.abs(Number(e.lat)) <= 90 && Math.abs(Number(e.lng)) <= 180 && e.lat !== "" && e.lng !== "") { set.lat = Number(e.lat); set.lng = Number(e.lng); }
  if (set.story) set.story = set.story.replace(/\n\nSource: "[\s\S]*"$/, ""); // the quote is for the reviewer, not players
  await db.update(questions).set(set).where(eq(questions.id, id));
  return NextResponse.json({ ok: true });
}
