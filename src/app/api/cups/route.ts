import { NextResponse } from "next/server";
import { CUP } from "@/lib/cup";
import { createCup, ensureDailyCup, hostedToday, myCups, openCups, tickCup } from "@/lib/cups";
import { istDate } from "@/lib/game";
import { getProfile, playerId } from "@/lib/server";

export const dynamic = "force-dynamic";

const BLOCK = /\b(fuck|shit|bitch|cunt|nigg|fag|rape|porn|sex|madarchod|bhenchod|chutiya|randi)/i;
const card = (c: Awaited<ReturnType<typeof openCups>>[number], entrants?: number) => ({
  code: c.code, name: c.name, visibility: c.visibility, capacity: c.capacity, phase: c.status, startsMs: c.startsMs, official: c.hostId === "geocricket", entrants,
});

// Cups: open public/official cups, and the ones I'm in.
export async function GET() {
  const pid = await playerId();
  await ensureDailyCup(istDate()).catch(() => {}); // normally made by the nightly cron; this covers a missed run
  const open = await Promise.all((await openCups()).map(tickCup)); // bring each up to date as it's listed
  const mine = pid ? await Promise.all((await myCups(pid)).map((r) => tickCup(r.cup))) : [];
  return NextResponse.json({ open: open.map((c) => card(c)), mine: mine.map((c) => ({ ...card(c), won: c.winnerId === pid })) });
}

// Host a cup. Validated here; the host takes seat 1.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const pid = await playerId(true);
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player first." }, { status: 403 });
  const name = String(body?.name ?? "").replace(/\s+/g, " ").trim();
  const capacity = Number(body?.capacity), startsMs = Number(body?.startsMs), now = Date.now();
  const visibility = body?.visibility === "public" ? "public" : "private";
  if (name.length < 3 || name.length > 40) return NextResponse.json({ error: "Give your cup a name (3–40 characters)." }, { status: 400 });
  if (BLOCK.test(name)) return NextResponse.json({ error: "Pick a friendlier name." }, { status: 400 });
  if (!(CUP.SIZES as readonly number[]).includes(capacity)) return NextResponse.json({ error: "Pick a size: 4, 8, 16 or 32." }, { status: 400 });
  if (!(startsMs >= now + 60_000 && startsMs <= now + 7 * 864e5)) return NextResponse.json({ error: "Start time must be between 1 minute and 7 days from now." }, { status: 400 });
  const h = await hostedToday(pid);
  if (h.n >= 5) return NextResponse.json({ error: "You can host 5 cups a day. Try again tomorrow." }, { status: 429 });
  if (h.open >= 2) return NextResponse.json({ error: "You already have 2 cups waiting to start." }, { status: 429 });
  return NextResponse.json(await createCup({ hostId: pid, name, capacity, startsMs, visibility }));
}
