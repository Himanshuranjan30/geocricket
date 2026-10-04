import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { markPrizePaid, prizeAdminList } from "@/lib/prize";

const deny = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

// GET → every settled prize day (winner, UPI, status). POST { day, paid } → mark a prize paid (after sending the UPI payment).
export async function GET() {
  if (!(await isAdmin())) return deny();
  return NextResponse.json({ items: await prizeAdminList() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return deny();
  const b = await req.json().catch(() => null);
  if (typeof b?.day !== "string" || typeof b?.paid !== "boolean") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await markPrizePaid(b.day, b.paid);
  return NextResponse.json({ ok: true });
}
