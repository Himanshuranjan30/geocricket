import { NextResponse } from "next/server";
import { getRound, isClosed, wouldRank } from "@/lib/server";

// Archive replays: where this score would have finished among the players who played the round live. Hypothetical
// only (nothing is stored), so the client's total is fine to trust, clamped to the round's maximum.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const key = sp.get("key") ?? "";
  if (!/^[a-z0-9-]{3,80}$/.test(key)) return NextResponse.json({ error: "No such round." }, { status: 404 });
  const round = await getRound(key);
  if (!round || !isClosed(round)) return NextResponse.json({ error: "No such round." }, { status: 404 });
  const max = round.questions.reduce((s, q) => s + 100 * q.mult, 0);
  const total = Math.max(0, Math.min(max, Math.round(Number(sp.get("total")) || 0)));
  return NextResponse.json({ key, total, max, ...(await wouldRank(key, total)) }, { headers: { "cache-control": "no-store" } });
}
