import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { challengeCandidates, createChallenge, listChallenges, setChallengeActive } from "@/lib/who";

export const dynamic = "force-dynamic";
const deny = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

// Creator challenges admin (/admin/challenges): the list, the player picker, create, and switch on/off.
export async function GET() {
  if (!(await isAdmin())) return deny();
  return NextResponse.json({ challenges: await listChallenges(), candidates: challengeCandidates() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return deny();
  const b = await req.json().catch(() => null);
  const r = await createChallenge({ slug: String(b?.slug ?? ""), title: String(b?.title ?? ""), host: String(b?.host ?? ""), players: Array.isArray(b?.players) ? b.players.map(String) : [] });
  return "error" in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r);
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return deny();
  const b = await req.json().catch(() => null);
  const ok = typeof b?.slug === "string" && typeof b?.active === "boolean" && (await setChallengeActive(b.slug, b.active));
  return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "No such challenge." }, { status: 404 });
}
