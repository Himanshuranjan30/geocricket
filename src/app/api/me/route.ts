import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { levelOf } from "@/lib/level";
import { canWear } from "@/lib/locker";
import { validateProfile } from "@/lib/profile";
import { googleEnabled } from "@/lib/auth";
import { addDays, istDate } from "@/lib/game";
import { getProfile, playedDays, playerId, savedDays, sessionUser } from "@/lib/server";
import { saveable, streakOf } from "@/lib/streak";

// Current player's profile and Google account (if signed in), plus a suggested country from Vercel's geo header.
export async function GET() {
  const [pid, user] = await Promise.all([playerId(), sessionUser()]);
  const profile = pid ? await getProfile(pid) : null;
  const db = await getDb();
  const [row] = pid ? await db.select({ xp: schema.players.xp, onboardedMs: schema.players.onboardedMs, customAvatar: schema.players.customAvatar }).from(schema.players).where(eq(schema.players.id, pid)) : [];
  const suggested = (await headers()).get("x-vercel-ip-country");
  // Days with any finished scored game, for the streak and its calendar (lib/streak.ts).
  const today = istDate();
  const [played, saved] = pid ? await Promise.all([playedDays(pid), savedDays(pid)]) : [[], []];
  const s = streakOf(played, today, saved);
  return NextResponse.json({
    profile,
    // Analytics user id (GA4 user_id): a keyed hash, so the player id itself never leaves the server.
    aid: pid ? createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "geocricket").update(pid).digest("hex").slice(0, 24) : null,
    level: levelOf(row?.xp ?? 0),
    onboarded: !!row?.onboardedMs, guest: !user,
    customAvatar: row?.customAvatar ?? (profile && !profile.avatar.startsWith("legend:") ? profile.avatar : null),
    streak: s.current, streakAtRisk: s.atRisk, freezeLeft: s.freezeLeft, saveStreak: saveable(played, saved, today),
    played: played.filter((d) => d >= addDays(today, -13)), frozen: s.frozen.filter((d) => d >= addDays(today, -13)),
    user: user ? { name: user.name, email: user.email, image: user.image ?? null } : null,
    googleEnabled,
    suggestedCountry: suggested && /^[A-Z]{2}$/.test(suggested) ? suggested : null,
  });
}

// Create or update handle, avatar and country. Handles are unique ignoring case.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = await sessionUser();
  let handle = String(body?.handle ?? "").trim();
  // Guests may skip the handle: they get a random one (they're not on leaderboards until they sign in).
  if (!handle && !user) handle = `guest_${Math.floor(100000 + Math.random() * 900000)}`;
  const p = { handle, avatar: String(body?.avatar ?? ""), country: String(body?.country ?? "").toUpperCase() };
  const err = validateProfile(p);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const pid = (await playerId(true))!;
  const db = await getDb();
  // Custom avatars and every kit are free; only legends need unlocking.
  if (p.avatar.startsWith("legend:") && !(await canWear(pid, p.avatar.slice(7)))) {
    return NextResponse.json({ error: "Unlock that legend in the Locker first." }, { status: 403 });
  }
  const [taken] = await db.select({ id: schema.players.id }).from(schema.players).where(sql`lower(${schema.players.handle}) = lower(${p.handle})`);
  if (taken && taken.id !== pid) return NextResponse.json({ error: `@${p.handle} is taken. Try another handle.` }, { status: 409 });
  try {
    // Remember the player's own character whenever they pick one, so switching back from a legend restores it.
    const [cur] = await db.select({ avatar: schema.players.avatar, customAvatar: schema.players.customAvatar }).from(schema.players).where(eq(schema.players.id, pid));
    const custom = !p.avatar.startsWith("legend:") ? { customAvatar: p.avatar }
      : !cur?.customAvatar && cur?.avatar && !cur.avatar.startsWith("legend:") ? { customAvatar: cur.avatar } : {};
    await db.update(schema.players).set({ ...p, ...custom, ...(body?.onboarded && user ? { onboardedMs: Date.now() } : {}) }).where(eq(schema.players.id, pid));
  } catch (e) {
    // Unique index on lower(handle): another player claimed it between our check and the update.
    if (String((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === "23505") {
      return NextResponse.json({ error: `@${p.handle} is taken. Try another handle.` }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ profile: p });
}
