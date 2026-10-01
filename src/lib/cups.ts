import "server-only";
import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { advanceCup, CUP, initialCup, myFixture, roundCount, roundName, type CupState, type MatchInfo } from "./cup";
import { tickLive } from "./duels";
import { notify } from "./inbox";
import { initialState, LIVE } from "./live";
import { rateMatch } from "./rating";
import { bestFrom, freshFrom, markSeen } from "./seen";
import { addXp } from "./server";

// Server side of Cups (rules live in cup.ts). Every change to a cup's state goes through tickCup's compare-and-set on
// state.v, and its side effects (creating matches, notifications, rewards) run only for the tick that won the write,
// so they happen exactly once however many players poll at the same moment.

const { cups, cupEntrants, cupWaitlist, duels, duelPlayers, duelGuesses, players } = schema;
const MISS_KM = 20_000; // tiebreak: an unanswered ball counts as a far miss
export const PLACE_XP: Record<number, number> = { 1: 500, 2: 250, 3: 100 };
const TAKE_PART_XP = 25;
export const SYSTEM_HOST = "geocricket"; // host id of official cups

const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
export type CupRow = typeof cups.$inferSelect;

export async function cupByCode(c: string) {
  const db = await getDb();
  return (await db.select().from(cups).where(eq(cups.code, c)))[0] ?? null;
}

export async function createCup(o: { hostId: string; name: string; capacity: number; startsMs: number; visibility: "private" | "public" | "official" }) {
  const db = await getDb();
  const id = crypto.randomUUID(), c = code(), now = Date.now();
  await db.insert(cups).values({ id, code: c, name: o.name, hostId: o.hostId, visibility: o.visibility, capacity: o.capacity, status: "lobby", startsMs: o.startsMs, state: initialCup(o.startsMs), createdMs: now });
  if (o.hostId !== SYSTEM_HOST) await db.insert(cupEntrants).values({ cupId: id, playerId: o.hostId, seat: 1, joinedMs: now, lastSeenMs: now });
  return { id, code: c };
}

/** Is this player already in another cup that's still to come or running? (one cup at a time) */
async function busyElsewhere(pid: string, cupId: string) {
  const db = await getDb();
  const rows = await db.select({ id: cups.id }).from(cupEntrants).innerJoin(cups, eq(cups.id, cupEntrants.cupId))
    .where(and(eq(cupEntrants.playerId, pid), inArray(cups.status, ["lobby", "checkin", "running"]), sql`${cups.id} <> ${cupId}`));
  return rows.length > 0;
}

/** Take a seat (1..capacity, unique per cup, so concurrent joins can't overfill), else join the waitlist. */
export async function joinCup(cup: CupRow, pid: string): Promise<{ ok: true; seat?: number; waitlist?: boolean } | { ok: false; error: string }> {
  if (cup.status !== "lobby" && cup.status !== "checkin") return { ok: false, error: "This cup has already started." };
  const db = await getDb();
  const mine = await db.select().from(cupEntrants).where(and(eq(cupEntrants.cupId, cup.id), eq(cupEntrants.playerId, pid)));
  if (mine.length) return { ok: true, seat: mine[0].seat };
  if (await busyElsewhere(pid, cup.id)) return { ok: false, error: "You're already in another cup. Finish or leave it first." };
  for (let attempt = 0; attempt < 6; attempt++) {
    const taken = new Set((await db.select({ seat: cupEntrants.seat }).from(cupEntrants).where(eq(cupEntrants.cupId, cup.id))).map((r) => r.seat));
    const seat = Array.from({ length: cup.capacity }, (_, i) => i + 1).find((s) => !taken.has(s));
    if (!seat) break;
    const now = Date.now();
    const ins = await db.insert(cupEntrants).values({ cupId: cup.id, playerId: pid, seat, joinedMs: now, lastSeenMs: now }).onConflictDoNothing().returning();
    if (ins.length) { await db.delete(cupWaitlist).where(and(eq(cupWaitlist.cupId, cup.id), eq(cupWaitlist.playerId, pid))); return { ok: true, seat }; }
    const again = await db.select().from(cupEntrants).where(and(eq(cupEntrants.cupId, cup.id), eq(cupEntrants.playerId, pid)));
    if (again.length) return { ok: true, seat: again[0].seat }; // a double-tap from this player won the race
  }
  await db.insert(cupWaitlist).values({ cupId: cup.id, playerId: pid, joinedMs: Date.now(), lastSeenMs: Date.now() }).onConflictDoNothing();
  return { ok: true, waitlist: true };
}

/** Leave before the start. Frees the seat for the first waitlisted player; a leaving host hands over to the next seat. */
export async function leaveCup(cup: CupRow, pid: string) {
  if (cup.status !== "lobby" && cup.status !== "checkin") return { ok: false as const, error: "You can't leave once the cup has started." };
  const db = await getDb();
  await db.delete(cupWaitlist).where(and(eq(cupWaitlist.cupId, cup.id), eq(cupWaitlist.playerId, pid)));
  const gone = await db.delete(cupEntrants).where(and(eq(cupEntrants.cupId, cup.id), eq(cupEntrants.playerId, pid))).returning();
  if (!gone.length) return { ok: true as const };
  const [next] = await db.select().from(cupWaitlist).where(eq(cupWaitlist.cupId, cup.id)).orderBy(asc(cupWaitlist.joinedMs)).limit(1);
  if (next) {
    const ins = await db.insert(cupEntrants).values({ cupId: cup.id, playerId: next.playerId, seat: gone[0].seat, joinedMs: Date.now(), lastSeenMs: next.lastSeenMs }).onConflictDoNothing().returning();
    if (ins.length) {
      await db.delete(cupWaitlist).where(and(eq(cupWaitlist.cupId, cup.id), eq(cupWaitlist.playerId, next.playerId)));
      await notify(next.playerId, { key: `cup-seat-${cup.id}`, kind: "cup", title: `🎟️ You're in ${cup.name}`, body: "A seat opened up. Be in the lobby at the start time.", url: `/cup/${cup.code}` }, true);
    }
  }
  if (cup.hostId === pid) {
    const [heir] = await db.select().from(cupEntrants).where(eq(cupEntrants.cupId, cup.id)).orderBy(asc(cupEntrants.joinedMs)).limit(1);
    if (heir) {
      await db.update(cups).set({ hostId: heir.playerId }).where(eq(cups.id, cup.id));
      await notify(heir.playerId, { key: `cup-host-${cup.id}`, kind: "cup", title: `👑 You're now hosting ${cup.name}`, body: "The host left, so the cup is yours.", url: `/cup/${cup.code}` }, true);
    } else await db.update(cups).set({ status: "cancelled", state: { ...cup.state, v: cup.state.v + 1, phase: "cancelled", cancelReason: "Everyone left." } }).where(eq(cups.id, cup.id));
  }
  return { ok: true as const };
}

/** Lobby presence: being on the cup page counts as checked in. */
export async function touch(cupId: string, pid: string) {
  const db = await getDb();
  const now = Date.now();
  await db.update(cupEntrants).set({ lastSeenMs: now }).where(and(eq(cupEntrants.cupId, cupId), eq(cupEntrants.playerId, pid)));
  await db.update(cupWaitlist).set({ lastSeenMs: now }).where(and(eq(cupWaitlist.cupId, cupId), eq(cupWaitlist.playerId, pid)));
}

/** Checked-in field, best seed first: seated players seen since check-in opened, then present waitlisters in order. */
async function checkedIn(cup: CupRow) {
  const db = await getDb();
  const since = cup.state.startsMs - CUP.CHECKIN_MS;
  const seated = await db.select({ pid: cupEntrants.playerId, seen: cupEntrants.lastSeenMs, joined: cupEntrants.joinedMs, rating: players.rating })
    .from(cupEntrants).leftJoin(players, eq(players.id, cupEntrants.playerId)).where(eq(cupEntrants.cupId, cup.id));
  const waiting = await db.select({ pid: cupWaitlist.playerId, seen: cupWaitlist.lastSeenMs, joined: cupWaitlist.joinedMs, rating: players.rating })
    .from(cupWaitlist).leftJoin(players, eq(players.id, cupWaitlist.playerId)).where(eq(cupWaitlist.cupId, cup.id)).orderBy(asc(cupWaitlist.joinedMs));
  const here = (r: { seen: number | null }) => (r.seen ?? 0) >= since;
  const field = seated.filter(here);
  for (const w of waiting.filter(here)) if (field.length < cup.capacity) field.push(w); // reserves fill no-shows
  return field.sort((a, b) => (b.rating ?? 1200) - (a.rating ?? 1200) || a.joined - b.joined).map((r) => r.pid);
}

/** Current round's live matches, ticked, as the cup rules see them. */
async function roundMatches(cup: CupRow, s: CupState) {
  const db = await getDb();
  const rows = await db.select({ id: duels.id }).from(duels).where(and(eq(duels.cupId, cup.id), eq(duels.cupRound, s.round)));
  const out: Record<string, MatchInfo> = {};
  for (const { id } of rows) {
    const d = await tickLive(id); // advance the match itself (it's lazy too)
    if (!d?.state) continue;
    const seats = await db.select().from(duelPlayers).where(eq(duelPlayers.duelId, id));
    const gs = await db.select({ pid: duelGuesses.playerId, km: duelGuesses.km }).from(duelGuesses).where(eq(duelGuesses.duelId, id));
    const resolved = d.state.log.length;
    const km = Object.fromEntries(seats.map((p) => {
      const mine = gs.filter((g) => g.pid === p.playerId);
      return [p.playerId, mine.reduce((t, g) => t + g.km, 0) + Math.max(0, resolved - mine.length) * MISS_KM];
    }));
    out[`${s.round}:${d.cupSlot}`] = {
      done: d.status === "done", winner: d.state.winner, openMs: (s.roundStartsMs ?? 0) + LIVE.START_DELAY_MS, hp: d.state.hp, km,
      seen: Object.fromEntries(seats.map((p) => [p.playerId, p.lastSeenMs != null])),
    };
  }
  return out;
}

/** Create the current round's matches (idempotent: one row per fixture by unique index). Same questions for all. */
async function materialize(cup: CupRow, s: CupState) {
  const db = await getDb();
  const fixtures = s.rounds[s.round]?.filter((f) => f.a && f.b && !f.winner) ?? [];
  if (!fixtures.length || s.roundStartsMs == null) return;
  const have = await db.select({ slot: duels.cupSlot, q: duels.questionIds }).from(duels).where(and(eq(duels.cupId, cup.id), eq(duels.cupRound, s.round)));
  const missing = fixtures.filter((f) => !have.some((h) => h.slot === f.slot));
  if (!missing.length) return;
  let qs = have[0]?.q;
  if (!qs) {
    const everyone = Object.keys(s.seeds);
    const used = new Set((await db.select({ q: duels.questionIds }).from(duels).where(eq(duels.cupId, cup.id))).flatMap((r) => r.q));
    const fresh = (await freshFrom("versus", LIVE.ROUNDS + 5, everyone)).questions.map((q) => q.id).filter((id) => !used.has(id));
    qs = fresh.slice(0, LIVE.ROUNDS);
    // Thin pool: best-known versus questions (repeats allowed, never within this cup), then Nets ones.
    for (const pool of ["versus", "nets"] as const) if (qs.length < LIVE.ROUNDS) qs = [...qs, ...(await bestFrom(pool, LIVE.ROUNDS - qs.length, new Set([...used, ...qs])))];
  }
  if (qs.length < LIVE.ROUNDS) return; // no questions at all: the rules' failsafe advances the higher seed after the cap
  for (const f of missing) {
    const id = crypto.randomUUID();
    const ins = await db.insert(duels).values({ id, kind: "cup", questionIds: qs, createdBy: f.a!, status: "playing", state: initialState([f.a!, f.b!], s.roundStartsMs), createdAt: Date.now(), cupId: cup.id, cupRound: s.round, cupSlot: f.slot })
      .onConflictDoNothing().returning();
    if (!ins.length) continue;
    const t = Date.now();
    await db.insert(duelPlayers).values([{ duelId: id, playerId: f.a!, joinedMs: t }, { duelId: id, playerId: f.b!, joinedMs: t + 1 }]).onConflictDoNothing();
    await Promise.all([markSeen(f.a!, qs, "cup"), markSeen(f.b!, qs, "cup")]);
  }
}

/** Bring a cup up to now. Safe to call from any request, any number of times, concurrently. */
export async function tickCup(cup: CupRow): Promise<CupRow> {
  if (cup.status === "done" || cup.status === "cancelled") return cup;
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = cup.state, now = Date.now();
    const entrants = s.phase === "checkin" && now >= s.startsMs ? await checkedIn(cup) : [];
    const matches = s.phase === "running" ? await roundMatches(cup, s) : {};
    const next = advanceCup(s, now, entrants, matches);
    if (next === s) {
      if (s.phase === "running") await materialize(cup, s); // repair a round whose matches didn't all get created
      return cup;
    }
    const saved = await db.update(cups).set({
      state: next, status: next.phase, startsMs: next.startsMs, winnerId: next.winner, runnerUpId: next.runnerUp, finishedMs: next.phase === "done" ? now : null,
    }).where(and(eq(cups.id, cup.id), sql`(${cups.state}->>'v')::int = ${s.v}`)).returning();
    if (!saved.length) { cup = (await db.select().from(cups).where(eq(cups.id, cup.id)))[0]; continue; } // someone else advanced it: retry on theirs
    await afterAdvance(saved[0], s, next);
    return saved[0];
  }
  return cup;
}

/** Side effects of one transition (runs once: only for the tick that won the write). */
async function afterAdvance(cup: CupRow, before: CupState, s: CupState) {
  const db = await getDb();
  const url = `/cup/${cup.code}`;
  const seated = async () => (await db.select({ pid: cupEntrants.playerId }).from(cupEntrants).where(eq(cupEntrants.cupId, cup.id))).map((r) => r.pid);
  if (before.phase === "lobby" && s.phase === "checkin") {
    for (const pid of await seated()) await notify(pid, { key: `cup-checkin-${cup.id}`, kind: "cup", title: `🏏 ${cup.name} starts in 10 min`, body: "Open the lobby to check in, or your seat goes to a reserve.", url }, true);
  }
  if (s.delayed && !before.delayed) {
    for (const pid of await seated()) await notify(pid, { key: `cup-delay-${cup.id}`, kind: "cup", title: `⏳ ${cup.name} pushed back 15 min`, body: "Not enough players checked in yet. Invite a friend!", url }, true);
  }
  if (s.phase === "cancelled") {
    for (const pid of await seated()) await notify(pid, { key: `cup-cancel-${cup.id}`, kind: "cup", title: `${cup.name} was cancelled`, body: s.cancelReason ?? "Not enough players.", url }, true);
    return;
  }
  // Newly decided fixtures: ratings for real matches, a note for whoever was knocked out.
  const total = s.rounds.length ? roundCount(s.rounds[0].length * 2) : 0;
  for (const [r, fixtures] of s.rounds.entries()) for (const f of fixtures) {
    const was = before.rounds[r]?.find((x) => x.slot === f.slot);
    if (!f.winner || was?.winner || f.how === "bye") continue;
    const loser = f.a === f.winner ? f.b : f.a;
    if (f.how === "played" || f.how === "cap") await rateMatch(f.a!, f.b!, f.winner);
    if (loser && s.phase !== "done") await notify(loser, { key: `cup-out-${cup.id}`, kind: "cup", title: `Knocked out of ${cup.name}`, body: `${roundName(r, total)} · you finish joint ${ordinal(s.places[loser])}. Keep watching the bracket!`, url });
  }
  // Seeding: reserves who filled no-show seats get a seat row (100+, so they never collide with real seats).
  if (s.phase === "running" && before.phase !== "running") {
    const seatedNow = new Set(await seated());
    let extra = 100;
    for (const pid of Object.keys(s.seeds)) if (!seatedNow.has(pid)) {
      await db.insert(cupEntrants).values({ cupId: cup.id, playerId: pid, seat: extra++, joinedMs: Date.now(), lastSeenMs: Date.now() }).onConflictDoNothing();
      await db.delete(cupWaitlist).where(and(eq(cupWaitlist.cupId, cup.id), eq(cupWaitlist.playerId, pid)));
    }
  }
  // A new round (or the first): create its matches and tell its players.
  if (s.phase === "running" && (before.phase !== "running" || before.round !== s.round)) {
    await materialize(cup, s);
    for (const f of s.rounds[s.round]) for (const p of [f.a, f.b]) if (p && f.b && !f.winner)
      await notify(p, { key: `cup-r${s.round}-${cup.id}`, kind: "cup", title: `⚔️ ${roundName(s.round, total)} · ${cup.name}`, body: "Your match starts in seconds. Tap to play!", url }, true);
  }
  if (s.phase === "done") {
    const ids = Object.keys(s.places);
    const signed = (await db.select({ id: players.id }).from(players).where(and(inArray(players.id, ids), isNotNull(players.userId)))).length;
    await db.update(cups).set({ signedIn: signed }).where(eq(cups.id, cup.id));
    const counts = signed >= CUP.MIN_PLAYERS; // rewards only for cups with 4+ real accounts (no farming with guests)
    for (const pid of ids) {
      const place = s.places[pid];
      if (counts) await addXp(pid, PLACE_XP[place] ?? TAKE_PART_XP);
      await notify(pid, place === 1
        ? { key: `cup-won-${cup.id}`, kind: "cup", title: `🏆 You won ${cup.name}!`, body: "Champion. The trophy's in your cabinet.", url }
        : { key: `cup-done-${cup.id}`, kind: "cup", title: `${cup.name} is over`, body: `You finished ${place === 2 ? "runner-up" : `joint ${ordinal(place)}`}.`, url }, true);
    }
  }
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Tick cups that need attention even with nobody watching (check-in reminders, starts, walkovers). Bounded. */
export async function tickDueCups(limit = 5) {
  const db = await getDb();
  const now = Date.now();
  const due = await db.select().from(cups).where(and(inArray(cups.status, ["lobby", "checkin", "running"]), lt(cups.startsMs, now + CUP.CHECKIN_MS))).limit(limit);
  for (const c of due) await tickCup(c).catch(() => {});
}

/** The cup a player is in right now and their match in it (for the home card / match page). */
export function currentMatchOf(s: CupState, pid: string) {
  const { fixture, alive } = myFixture(s, pid);
  return { alive, fixture, round: s.round, name: s.rounds.length ? roundName(s.round, roundCount(s.rounds[0].length * 2)) : null };
}

export async function duelForFixture(cupId: string, round: number, slot: number) {
  const db = await getDb();
  return (await db.select({ id: duels.id }).from(duels).where(and(eq(duels.cupId, cupId), eq(duels.cupRound, round), eq(duels.cupSlot, slot))))[0]?.id ?? null;
}

export async function openCups() {
  const db = await getDb();
  return db.select().from(cups).where(and(inArray(cups.visibility, ["public", "official"]), inArray(cups.status, ["lobby", "checkin", "running"]))).orderBy(asc(cups.startsMs)).limit(30);
}

export async function myCups(pid: string) {
  const db = await getDb();
  return db.select({ cup: cups }).from(cupEntrants).innerJoin(cups, eq(cups.id, cupEntrants.cupId)).where(eq(cupEntrants.playerId, pid)).orderBy(sql`${cups.startsMs} desc`).limit(20);
}

export async function hostedToday(hostId: string) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(cups).where(and(eq(cups.hostId, hostId), sql`${cups.createdMs} > ${Date.now() - 864e5}`));
  const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(cups).where(and(eq(cups.hostId, hostId), inArray(cups.status, ["lobby", "checkin"])));
  return { n, open };
}


/** What a player may see of a cup. Players appear as seat aliases ("s3"), never ids (ids double as login cookies). */
export async function cupView(cup: CupRow, pid: string | null) {
  const db = await getDb();
  const s = cup.state, since = s.startsMs - CUP.CHECKIN_MS;
  const rows = await db.select({ pid: cupEntrants.playerId, seat: cupEntrants.seat, seen: cupEntrants.lastSeenMs, handle: players.handle, avatar: players.avatar, country: players.country, rating: players.rating })
    .from(cupEntrants).leftJoin(players, eq(players.id, cupEntrants.playerId)).where(eq(cupEntrants.cupId, cup.id)).orderBy(asc(cupEntrants.seat));
  const wait = await db.select({ pid: cupWaitlist.playerId }).from(cupWaitlist).where(eq(cupWaitlist.cupId, cup.id)).orderBy(asc(cupWaitlist.joinedMs));
  const alias = new Map(rows.map((r) => [r.pid, `s${r.seat}`]));
  const A = (p: string | null) => (p ? alias.get(p) ?? null : null);
  const host = cup.hostId === SYSTEM_HOST ? null : rows.find((r) => r.pid === cup.hostId);
  const matchIds = await db.select({ id: duels.id, round: duels.cupRound, slot: duels.cupSlot }).from(duels).where(eq(duels.cupId, cup.id));
  const total = s.rounds.length ? roundCount(s.rounds[0].length * 2) : roundCount(Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(rows.length, 4)))));
  const mine = pid ? currentMatchOf(s, pid) : null;
  const myDuel = mine?.fixture && mine.fixture.b && !mine.fixture.winner ? matchIds.find((m) => m.round === s.round && m.slot === mine.fixture!.slot)?.id ?? null : null;
  return {
    code: cup.code, name: cup.name, visibility: cup.visibility, capacity: cup.capacity, official: cup.hostId === SYSTEM_HOST,
    host: host ? { alias: A(host.pid), handle: host.handle } : null,
    phase: s.phase, startsMs: s.startsMs, delayed: s.delayed, cancelReason: s.cancelReason, now: Date.now(),
    round: s.round, roundStartsMs: s.roundStartsMs, rounds: total,
    entrants: rows.map((r) => ({ alias: `s${r.seat}`, handle: r.handle ?? "player", avatar: r.avatar ?? "", country: r.country, here: (r.seen ?? 0) >= since && s.phase !== "lobby", online: (r.seen ?? 0) > Date.now() - 60_000, reserve: r.seat > 100, missed: s.phase === "running" || s.phase === "done" ? !s.seeds[r.pid] : false })),
    waitlist: wait.length,
    bracket: s.rounds.map((fixtures, r) => ({ name: roundName(r, total), fixtures: fixtures.map((f) => ({ slot: f.slot, a: A(f.a), b: A(f.b), winner: A(f.winner), how: f.how })) })),
    places: Object.fromEntries(Object.entries(s.places).map(([p, place]) => [A(p), place])),
    winner: A(s.winner), runnerUp: A(s.runnerUp),
    me: pid ? {
      alias: A(pid), seated: alias.has(pid), waitlist: wait.findIndex((w) => w.pid === pid) + 1 || null, host: cup.hostId === pid,
      alive: !!mine?.alive, place: s.places[pid] ?? null, match: myDuel, roundName: mine?.name ?? null,
    } : null,
  };
}
export type CupView = Awaited<ReturnType<typeof cupView>>;

// The official Daily Cup: a public 32-player cup every night at 9:30 PM IST (after the evening games). The code is
// fixed per day, so creating it twice is impossible (unique code) however many times this runs.
export const DAILY_CUP_HOUR_IST = 21.5;
export async function ensureDailyCup(day: string) {
  const code = `dc${day.replace(/-/g, "")}`;
  if (await cupByCode(code)) return null;
  const startsMs = Date.parse(`${day}T00:00:00+05:30`) + DAILY_CUP_HOUR_IST * 3600e3;
  if (startsMs < Date.now() + 5 * 60_000) return null; // too late today
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(cups).values({ id, code, name: `Daily Cup · ${new Date(startsMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`,
    hostId: SYSTEM_HOST, visibility: "official", capacity: 32, status: "lobby", startsMs, state: initialCup(startsMs), createdMs: Date.now() }).onConflictDoNothing();
  return code;
}
