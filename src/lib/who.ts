import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import raw from "@/content/who.json";
import bank from "@/content/who-duel.json";
import photos from "@/content/who-photos.json";
import { istDate } from "./game";
import { CLUES, PER_DAY, POINTS, puzzleState, shareText, tile, type Clue } from "./whoRules";

export { POINTS, CLUES, PER_DAY };

// "Who's the Player?": three players a day, five clues each. A guess or a skip on clue n costs nothing but moves you
// to clue n+1; solving on clue n scores POINTS[n]. Content (answers included) is built by scripts/who-build.mjs and
// never sent to the client: the API hands out only the clues a player has already earned.

type Puzzle = { player: string; fame: number; anchor: string; story: string; clues: Clue[] };
type Content = { start: string; players: { id: string; name: string; team: string }[]; puzzles: Record<string, Puzzle>; days: Record<string, string[]> };
const content = raw as unknown as Content;

const hasPhoto = new Set(Object.keys(photos)); // public/players/<id>.jpg, fetched by scripts/who-photos.mjs
export const whoPlayers = () => content.players.map((p) => ({ ...p, photo: hasPhoto.has(p.id) }));
const playerById = new Map(content.players.map((p) => [p.id, p]));
const dayKeys = Object.keys(content.days).sort();
export const whoPlayer = (id: string) => { const p = playerById.get(id); return p ? { ...p, photo: hasPhoto.has(p.id) } : null; };
/** Players who are a daily answer between `from` and `to` (inclusive): the 1v1 bank keeps clear of them. */
export const dailyPlayersBetween = (from: string, to: string) =>
  new Set(dayKeys.filter((d) => d >= from && d <= to).flatMap((d) => content.days[d].map((k) => content.puzzles[k].player)));

/** The puzzle set for a date, or null if nothing is scheduled. Future days are never served (they'd leak answers). */
export function whoDay(date: string, today = istDate()) {
  if (date > today) return null;
  const ids = content.days[date];
  return ids ? { date, number: dayKeys.indexOf(date) + 1, puzzles: ids.map((id) => content.puzzles[id]) } : null;
}
export const whoToday = () => whoDay(istDate());

// Every puzzle a creator challenge can use: the daily's (by key) and the 1v1 bank's ("d:" + key).
const ALL: Record<string, Puzzle> = { ...content.puzzles, ...Object.fromEntries(Object.entries((bank as unknown as { puzzles: Record<string, Puzzle> }).puzzles).map(([k, v]) => [`d:${k}`, v])) };
export const puzzleByKey = (k: string) => ALL[k] ?? null;
export const allPuzzleKeys = () => Object.keys(ALL);
export const isChallenge = (set: string) => set.startsWith("c:");

/** A playable set: a date (the daily) or "c:<slug>" (a creator challenge). Null if it isn't open. */
export async function whoSet(set: string) {
  if (!isChallenge(set)) { const d = whoDay(set); return d ? { ...d, challenge: null } : null; }
  const db = await getDb();
  const [c] = await db.select().from(schema.whoChallenges).where(eq(schema.whoChallenges.slug, set.slice(2)));
  const puzzles = c?.active ? c.puzzles.map(puzzleByKey) : [];
  if (!c || !puzzles.length || puzzles.some((p) => !p)) return null;
  return { date: set, number: 0, puzzles: puzzles as Puzzle[], challenge: c };
}

// "Beat my Who" links carry a keyed hash of the sharer's player id (ids double as login cookies, so never the id).
export const challengeCode = (pid: string) => createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "geocricket").update(`who:${pid}`).digest("hex").slice(0, 10);

/** The sharer behind a challenge code, if they finished that day: their handle and how each puzzle went. */
async function rivalFor(code: string, date: string, me: string | null) {
  const db = await getDb();
  // ponytail: hashes every result of the day to find the code; fine to ~50K plays a day, then store the code on the row.
  const rows = await db.select({ pid: schema.whoResults.playerId, total: schema.whoResults.total, steps: schema.whoResults.steps }).from(schema.whoResults).where(eq(schema.whoResults.date, date));
  const r = rows.find((x) => challengeCode(x.pid) === code);
  if (!r || r.pid === me) return null;
  const [p] = await db.select({ handle: schema.players.handle, avatar: schema.players.avatar }).from(schema.players).where(eq(schema.players.id, r.pid));
  return { handle: p?.handle ?? null, avatar: p?.avatar ?? null, total: r.total, steps: r.steps };
}

/** Everything the page needs for one player and one day: earned clues only, answers only once a puzzle is over. */
export async function whoView(pid: string | null, date: string, vs?: string | null) {
  const day = await whoSet(date);
  if (!day) return null;
  const db = await getDb();
  const rows = pid ? await db.select().from(schema.whoGuesses).where(and(eq(schema.whoGuesses.playerId, pid), eq(schema.whoGuesses.date, date))) : [];
  const items = day.puzzles.map((p, idx) => {
    const st = puzzleState(rows.filter((r) => r.idx === idx));
    const answer = playerById.get(p.player)!;
    return {
      idx,
      clues: p.clues.slice(0, st.done ? CLUES : st.step + 1),
      step: st.step, done: st.done, solvedAt: st.solvedAt, points: st.points,
      misses: st.picks.map((id) => (id ? playerById.get(id)?.name ?? "?" : null)),
      answer: st.done ? { id: answer.id, name: answer.name, team: answer.team, story: p.story, photo: hasPhoto.has(answer.id) } : null,
    };
  });
  const finished = items.every((i) => i.done);
  const total = items.reduce((s, i) => s + i.points, 0);
  let result: { total: number; betterThan: number | null; share: string } | null = null;
  if (finished && pid) {
    const [[{ below }], [{ all }]] = await Promise.all([
      db.select({ below: sql<number>`count(*)::int` }).from(schema.whoResults).where(and(eq(schema.whoResults.date, date), lt(schema.whoResults.total, total))),
      db.select({ all: sql<number>`count(*)::int` }).from(schema.whoResults).where(eq(schema.whoResults.date, date)),
    ]);
    const betterThan = all >= 5 ? Math.round((100 * below) / all) : null; // a percentage of four people means nothing
    const c = day.challenge;
    result = { total, betterThan, share: c
      ? challengeShare(c.title, items.map((i) => i.solvedAt), total, items.length, `geocricket.app/mystery/c/${c.slug}`)
      : shareText(day.number, items.map((i) => i.solvedAt), total, betterThan, `Beat me: geocricket.app/mystery?date=${date}&vs=${challengeCode(pid)}`) };
  }
  const rival = vs && !day.challenge ? await rivalFor(vs, date, pid) : null;
  const challenge = day.challenge ? await challengeInfo(day.challenge, pid) : null;
  return { date, number: day.number, items, total, finished, result, rival, challenge };
}

/** Records one guess (pick = player id) or skip (pick = null). Safe to retry: the step is decided here, and a second
 * request for the same step hits the primary key and changes nothing. */
export async function whoGuess(pid: string, date: string, idx: number, pick: string | null, at?: number) {
  const day = await whoSet(date);
  if (!day || !Number.isInteger(idx) || idx < 0 || idx >= day.puzzles.length) return { error: "That puzzle isn't open." } as const;
  if (pick !== null && !playerById.has(pick)) return { error: "Pick a player from the list." } as const;
  const db = await getDb();
  const mine = await db.select().from(schema.whoGuesses).where(and(eq(schema.whoGuesses.playerId, pid), eq(schema.whoGuesses.date, date), eq(schema.whoGuesses.idx, idx)));
  const st = puzzleState(mine);
  if (st.done) return { ok: true, already: true } as const;
  // The client says which clue it was looking at: a double-tap or a retried request meant for an earlier clue is a no-op.
  if (at !== undefined && at !== st.step) return { ok: true, already: true } as const;
  if (pick !== null && st.picks.includes(pick)) return { error: "You've already tried that player." } as const;
  const correct = pick === day.puzzles[idx].player;
  // A parallel guess may have taken this step first; only claim "correct" if ours is the one recorded.
  const ins = await db.insert(schema.whoGuesses).values({ playerId: pid, date, idx, step: st.step, pick, correct, atMs: Date.now() }).onConflictDoNothing().returning();
  return { ok: true, correct: ins.length > 0 && correct } as const;
}

/** Called when a player's last puzzle of the day is done: one result row per player per day. */
export async function saveWhoResult(pid: string, date: string, steps: (number | null)[], total: number) {
  const db = await getDb();
  const ins = await db.insert(schema.whoResults).values({ playerId: pid, date, total, steps }).onConflictDoNothing().returning();
  return ins.length > 0;
}

// ---- creator challenges ----

const challengeShare = (title: string, steps: (number | null)[], total: number, n: number, url: string) =>
  [`🏏 ${title} · GeoCricket`, `${steps.map(tile).join("")}  ${total}/${n * POINTS[0]}`, `Clues: ${steps.map((s) => (s === null ? "✗" : s + 1)).join(" · ")}`, `Beat me: ${url}`].join("\n");

type Challenge = typeof schema.whoChallenges.$inferSelect;
/** Header and leaderboard for a challenge page: host, host's score to beat, top 20 and the viewer's row. */
async function challengeInfo(c: Challenge, me: string | null) {
  const db = await getDb();
  const set = `c:${c.slug}`;
  const rows = await db.select({ pid: schema.whoResults.playerId, total: schema.whoResults.total, steps: schema.whoResults.steps, at: schema.whoResults.createdAt, handle: schema.players.handle, avatar: schema.players.avatar })
    .from(schema.whoResults).leftJoin(schema.players, eq(schema.players.id, schema.whoResults.playerId))
    .where(eq(schema.whoResults.date, set)).orderBy(desc(schema.whoResults.total), schema.whoResults.createdAt);
  // Guests have random handles ("guest_123456"): shown as Guest until they pick a name.
  const name = (h: string | null) => (!h || /^guest_\d+$/.test(h) ? "Guest" : h);
  const row = (r: (typeof rows)[number], i: number) => ({ rank: i + 1, handle: r.pid === c.hostPlayerId ? c.hostHandle : name(r.handle), avatar: r.avatar, total: r.total, host: r.pid === c.hostPlayerId, me: r.pid === me });
  const host = rows.find((r) => r.pid === c.hostPlayerId);
  const mine = rows.findIndex((r) => r.pid === me);
  return {
    slug: c.slug, title: c.title, hostHandle: c.hostHandle, isHost: !!me && me === c.hostPlayerId,
    hostTotal: host?.total ?? null, hostSteps: host?.steps ?? null, players: rows.length,
    top: rows.slice(0, 20).map(row), me: mine >= 0 ? row(rows[mine], mine) : null,
  };
}

/** Opening the host link (?host=<key>) makes this player the challenge's host. The seat can move until the host has
 * finished the challenge: two first requests racing (no cookie yet) each make a guest, and the browser keeps the
 * second one, so the last claim before the host plays wins. Once the host has a result, the seat is fixed. */
export async function claimHost(slug: string, key: string, pid: string) {
  const db = await getDb();
  const done = await db.update(schema.whoChallenges).set({ hostPlayerId: pid })
    .where(and(eq(schema.whoChallenges.slug, slug), eq(schema.whoChallenges.hostKey, key),
      sql`(${schema.whoChallenges.hostPlayerId} is null or not exists (select 1 from who_results r where r.player_id = ${schema.whoChallenges.hostPlayerId} and r.date = 'c:' || ${schema.whoChallenges.slug}))`)).returning();
  return done.length > 0;
}

// ---- creating challenges (admin page; scripts/challenge.mjs does the same from the command line) ----

/** One puzzle per player that a challenge may use: never a moment still to come in the daily (that would spoil it). */
function challengeBank(today = istDate()) {
  const ahead = new Set(dayKeys.filter((d) => d >= today).flatMap((d) => content.days[d].map((k) => content.puzzles[k].anchor)));
  const byPlayer = new Map<string, string>(), scheduled = new Set<string>();
  for (const [k, p] of Object.entries(ALL)) {
    if (ahead.has(p.anchor)) { scheduled.add(p.player); continue; }
    if (!byPlayer.has(p.player) || k.startsWith("d:")) byPlayer.set(p.player, k); // prefer the 1v1 bank's (biggest moment)
  }
  return { byPlayer, blocked: [...scheduled].filter((id) => !byPlayer.has(id)) };
}

/** Every player the guess box knows, marked usable or not, most-documented first (for the admin picker). */
export function challengeCandidates() {
  const { byPlayer, blocked } = challengeBank();
  const bad = new Set(blocked);
  return [...byPlayer.keys(), ...bad].map((id) => {
    const p = whoPlayer(id)!;
    const k = byPlayer.get(id);
    return { id, name: p.name, team: p.team, photo: p.photo, fame: k ? ALL[k].fame : 0, usable: !!k };
  }).sort((a, b) => Number(b.usable) - Number(a.usable) || b.fame - a.fame);
}

export async function createChallenge(input: { slug: string; title: string; host: string; players: string[]; hostPlayerId?: string }) {
  const slug = input.slug.trim().toLowerCase(), title = input.title.trim(), host = input.host.trim().replace(/^@/, "");
  if (!/^[a-z0-9-]{2,30}$/.test(slug)) return { error: "Link name: 2–30 lowercase letters, numbers or dashes." } as const;
  if (title.length < 3 || title.length > 60) return { error: "Give it a title (3 to 60 characters)." } as const;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(host)) return { error: "Host: the creator's X handle." } as const;
  const ids = [...new Set(input.players)];
  if (ids.length < 3 || ids.length > 5) return { error: "Pick 3 to 5 players." } as const;
  const { byPlayer } = challengeBank();
  const missing = ids.filter((id) => !byPlayer.has(id));
  if (missing.length) return { error: `Can't use ${missing.map((id) => whoPlayer(id)?.name ?? id).join(", ")}: every moment we hold is coming up in the daily.` } as const;
  const db = await getDb();
  const hostKey = randomBytes(9).toString("base64url");
  // A self-hosted challenge (anyone, /mystery/host) is seated to its creator at once; an admin-made one waits for the
  // host link.
  const ins = await db.insert(schema.whoChallenges).values({ slug, title, hostHandle: host, puzzles: ids.map((id) => byPlayer.get(id)!), hostKey, createdMs: Date.now(), hostPlayerId: input.hostPlayerId ?? null }).onConflictDoNothing().returning();
  if (!ins.length) return { error: `The link "${slug}" is taken. Pick another.` } as const;
  return { ok: true, slug, hostKey } as const;
}

/** Admin list: each challenge with how many have played and whether the host has set a score. */
export async function listChallenges() {
  const db = await getDb();
  const rows = await db.select().from(schema.whoChallenges).orderBy(desc(schema.whoChallenges.createdMs));
  const counts = await db.select({ date: schema.whoResults.date, n: sql<number>`count(*)::int` }).from(schema.whoResults).where(sql`${schema.whoResults.date} like 'c:%'`).groupBy(schema.whoResults.date);
  const hostPlayed = await db.select({ date: schema.whoResults.date }).from(schema.whoResults).innerJoin(schema.whoChallenges, and(eq(schema.whoChallenges.hostPlayerId, schema.whoResults.playerId), sql`${schema.whoResults.date} = 'c:' || ${schema.whoChallenges.slug}`));
  const n = new Map(counts.map((c) => [c.date, c.n])), played = new Set(hostPlayed.map((h) => h.date));
  return rows.map((c) => ({
    slug: c.slug, title: c.title, host: c.hostHandle, hostKey: c.hostKey, active: c.active, createdMs: c.createdMs,
    players: c.puzzles.map((k) => whoPlayer(ALL[k]?.player ?? "")?.name ?? "?"), plays: n.get(`c:${c.slug}`) ?? 0,
    hostClaimed: !!c.hostPlayerId, hostPlayed: played.has(`c:${c.slug}`),
  }));
}
export async function setChallengeActive(slug: string, active: boolean) {
  const db = await getDb();
  return (await db.update(schema.whoChallenges).set({ active }).where(eq(schema.whoChallenges.slug, slug)).returning()).length > 0;
}

const HOST_PER_DAY = 3;
/** Anyone with a player profile hosts their own challenge, under their own handle (no hosting as someone else). */
export async function hostChallenge(pid: string, input: { title: string; players: string[] }) {
  const db = await getDb();
  const [p] = await db.select({ handle: schema.players.handle }).from(schema.players).where(eq(schema.players.id, pid));
  if (!p?.handle) return { error: "Set up your player first.", needProfile: true } as const;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.whoChallenges)
    .where(and(eq(schema.whoChallenges.hostPlayerId, pid), sql`${schema.whoChallenges.createdMs} > ${Date.now() - 864e5}`));
  if (n >= HOST_PER_DAY) return { error: `You can host ${HOST_PER_DAY} new challenges a day. Try again tomorrow.` } as const;
  const base = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 22).replace(/^-+|-+$/g, "") || "challenge";
  const slug = `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`; // readable, and nobody can guess or take someone else's
  return createChallenge({ slug, title: input.title, host: p.handle.replace(/^guest_/, "guest"), players: input.players, hostPlayerId: pid });
}

/** A player's own hosted challenges, newest first, with how many have played. */
export async function myChallenges(pid: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.whoChallenges).where(eq(schema.whoChallenges.hostPlayerId, pid)).orderBy(desc(schema.whoChallenges.createdMs));
  if (!rows.length) return [];
  const counts = await db.select({ date: schema.whoResults.date, n: sql<number>`count(*)::int` }).from(schema.whoResults)
    .where(sql`${schema.whoResults.date} in (${sql.join(rows.map((r) => sql`${"c:" + r.slug}`), sql`, `)})`).groupBy(schema.whoResults.date);
  const n = new Map(counts.map((c) => [c.date, c.n]));
  return rows.map((c) => ({ slug: c.slug, title: c.title, active: c.active, players: c.puzzles.map((k) => whoPlayer(ALL[k]?.player ?? "")?.name ?? "?"), plays: n.get(`c:${c.slug}`) ?? 0 }));
}
