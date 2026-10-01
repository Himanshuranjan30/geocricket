import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import bank from "@/content/who-duel.json";
import { addDays, istDate } from "./game";
import { addXp } from "./server";
import { dailyPlayersBetween, whoPlayer, whoPlayers } from "./who";
import { advance, botBuzzes, clueAt, initialWho, isBot, makeBot, roundEnd, WL, type Buzz, type WhoLiveState } from "./whoLive";
import type { Clue } from "./whoRules";

// Who's the Player? 1v1 "Name Race" (duels kind "who"): lobbies, matchmaking, the bot, buzzes and the per-player view.
// Rules are in lib/whoLive.ts. Puzzles come from the duel bank (scripts/who-build.mjs --duel), never from players
// due in the daily soon, so a duel can't spoil tomorrow's answers.

type Puzzle = { player: string; fame: number; story: string; clues: Clue[] };
const PUZZLES = (bank as unknown as { puzzles: Record<string, Puzzle> }).puzzles;
const KEEP_CLEAR_DAYS = 21;
const XP = { win: 25, draw: 15, loss: 10 };
const { duels, duelPlayers, whoBuzzes, players } = schema;
const stateOf = (d: { state: unknown }) => d.state as WhoLiveState | null;

/** Five puzzles neither player has had in a duel, none due in the daily soon; famous players first as a warm-up. */
async function pickPuzzles(pids: string[]) {
  const db = await getDb();
  const today = istDate();
  const blocked = dailyPlayersBetween(today, addDays(today, KEEP_CLEAR_DAYS));
  const past = await db.select({ ids: duels.questionIds }).from(duels).innerJoin(duelPlayers, eq(duelPlayers.duelId, duels.id))
    .where(and(eq(duels.kind, "who"), inArray(duelPlayers.playerId, pids))).orderBy(desc(duels.createdAt)).limit(60);
  const seen = new Set(past.flatMap((p) => p.ids.map((k) => PUZZLES[k]?.player)));
  const open = Object.keys(PUZZLES).filter((k) => !blocked.has(PUZZLES[k].player)).sort(() => Math.random() - 0.5);
  const order = [...open.filter((k) => !seen.has(PUZZLES[k].player)), ...open.filter((k) => seen.has(PUZZLES[k].player))]; // repeats only once the bank runs dry
  return order.slice(0, WL.ROUNDS).sort((a, b) => PUZZLES[b].fame - PUZZLES[a].fame);
}

// The bot's wrong names: other players from the same team, so its misses look like a person's.
const pool = whoPlayers();
const decoysFor = (answer: string) => { const team = whoPlayer(answer)?.team; return pool.filter((p) => p.team === team && p.id !== answer).map((p) => p.id).slice(0, 25); };

function allBuzzes(s: WhoLiveState, rows: Buzz[], ids: string[]) {
  return (round: number) => {
    const mine = rows.filter((b) => b.round === round);
    if (!s.bot || round !== s.round) return mine;
    const p = PUZZLES[ids[round]];
    return [...mine, ...botBuzzes(s.bot, round, s.openMs, p.fame, p.player, decoysFor(p.player))];
  };
}
// Bot buzzes for past rounds are rebuilt from the log's open times only for display; the state already holds results.
const botRound = (s: WhoLiveState, ids: string[], round: number, openMs: number) => {
  const p = PUZZLES[ids[round]];
  return s.bot ? botBuzzes(s.bot, round, openMs, p.fame, p.player, decoysFor(p.player)) : [];
};

export async function createWhoDuel(pid: string, mode: "quick" | "private" | "bot") {
  const db = await getDb();
  const id = crypto.randomUUID().slice(0, 8);
  await db.insert(duels).values({ id, kind: "who", questionIds: [], createdBy: pid, quick: mode === "quick", createdAt: Date.now() });
  await db.insert(duelPlayers).values({ duelId: id, playerId: pid, joinedMs: Date.now() });
  if (mode === "bot") await startBot(id, pid);
  return id;
}

export async function findWhoLobby(pid: string) {
  const db = await getDb();
  const rows = await db.select({ id: duels.id, createdBy: duels.createdBy }).from(duels)
    .where(and(eq(duels.kind, "who"), eq(duels.status, "open"), eq(duels.quick, true), gt(duels.createdAt, Date.now() - WL.QUICK_WAIT_MS)))
    .orderBy(desc(duels.createdAt)).limit(5);
  return rows.find((r) => r.createdBy !== pid) ?? null;
}

/** Second player takes the empty seat and the clock starts. False if the seat was already taken. */
export async function joinWho(duelId: string, pid: string) {
  const db = await getDb();
  const [d] = await db.select().from(duels).where(eq(duels.id, duelId));
  if (!d || d.kind !== "who") return false;
  if (d.status !== "open") return (await db.select().from(duelPlayers).where(and(eq(duelPlayers.duelId, duelId), eq(duelPlayers.playerId, pid)))).length > 0;
  if (d.createdBy === pid) return true;
  const ids = await pickPuzzles([d.createdBy, pid]);
  // Compare-and-set on status so two people can't both take the last seat.
  const taken = await db.update(duels).set({ status: "playing", state: initialWho([d.createdBy, pid], Date.now()) as never, questionIds: ids })
    .where(and(eq(duels.id, duelId), eq(duels.status, "open"))).returning();
  if (!taken.length) return false;
  await db.insert(duelPlayers).values({ duelId, playerId: pid, joinedMs: Date.now() }).onConflictDoNothing();
  return true;
}

/** Nobody came (or the player asked for one): the creator plays the bot instead. */
export async function startBot(duelId: string, pid: string) {
  const db = await getDb();
  const [d] = await db.select().from(duels).where(eq(duels.id, duelId));
  if (!d || d.kind !== "who" || d.createdBy !== pid) return false;
  if (d.status !== "open") return true;
  const bot = makeBot(Math.floor(Math.random() * 1e9));
  const ids = await pickPuzzles([pid]);
  const taken = await db.update(duels).set({ status: "playing", ghostOf: "bot", state: initialWho([pid, bot.pid], Date.now(), bot) as never, questionIds: ids })
    .where(and(eq(duels.id, duelId), eq(duels.status, "open"))).returning();
  if (!taken.length) return false;
  await db.insert(duelPlayers).values({ duelId, playerId: bot.pid, joinedMs: Date.now() }).onConflictDoNothing();
  return true;
}

const buzzRows = async (duelId: string) => {
  const db = await getDb();
  return (await db.select().from(whoBuzzes).where(eq(whoBuzzes.duelId, duelId))).map((b): Buzz => ({ pid: b.playerId, round: b.round, clue: b.clue, pick: b.pick, correct: b.correct, atMs: b.atMs }));
};

/** Load a match and move it forward to now (idempotent; concurrent callers settle via the version check). */
export async function tickWho(duelId: string) {
  const db = await getDb();
  const [d] = await db.select().from(duels).where(eq(duels.id, duelId));
  if (!d || d.kind !== "who") return null;
  const s = stateOf(d);
  if (d.status !== "playing" || !s) return { d, rows: [] as Buzz[] };
  const rows = await buzzRows(duelId);
  const next = advance(s, Date.now(), allBuzzes(s, rows, d.questionIds));
  if (next === s) return { d, rows };
  const saved = await db.update(duels).set({ state: next as never, status: next.winner ? "done" : "playing" })
    .where(and(eq(duels.id, duelId), sql`(${duels.state}->>'v')::int = ${s.v}`)).returning();
  // Only the tick that wrote the final result gets here, so the rating and XP move exactly once.
  if (saved.length && next.winner && !s.winner) {
    const ids = Object.keys(next.wins), humans = ids.filter((id) => !isBot(id));
    await Promise.all(humans.map((id) => addXp(id, next.winner === "draw" ? XP.draw : next.winner === id ? XP.win : XP.loss).catch(() => {})));
    if (humans.length === 2 && next.winner !== "draw") await import("./rating").then((m) => m.rateMatch(ids[0], ids[1], next.winner!)).catch(() => {});
  }
  return { d: saved[0] ?? (await db.select().from(duels).where(eq(duels.id, duelId)))[0], rows };
}

const face = (id: string) => { const p = whoPlayer(id)!; return { id: p.id, name: p.name, team: p.team, photo: p.photo }; };

/** What one player may see: clues that have landed, buzzes already made, answers only for finished rounds. */
export async function whoDuelView(duelId: string, me: string | null) {
  const t = await tickWho(duelId);
  if (!t) return null;
  const { d } = t;
  const s = stateOf(d), now = Date.now();
  const db = await getDb();
  const roster = await db.select({ pid: duelPlayers.playerId, handle: players.handle, avatar: players.avatar, country: players.country })
    .from(duelPlayers).leftJoin(players, eq(players.id, duelPlayers.playerId)).where(eq(duelPlayers.duelId, duelId)).orderBy(duelPlayers.joinedMs);
  // Player ids double as login cookies, so never send them: players become slots "p0"/"p1" in join order.
  const slot = new Map(roster.map((p, i) => [p.pid, `p${i}`]));
  const S = (pid: string | null) => (pid && slot.get(pid)) ?? pid;
  const keyed = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [S(k), v]));
  const view = {
    id: duelId, status: d.status, now, rounds: WL.ROUNDS, win: WL.WIN, bot: !!s?.bot, quick: d.quick,
    players: roster.map((p) => isBot(p.pid) && s?.bot
      ? { slot: S(p.pid)!, me: false, handle: s.bot.handle, avatar: s.bot.avatar, country: null, bot: true }
      : { slot: S(p.pid)!, me: p.pid === me, handle: p.handle ?? "player", avatar: p.avatar ?? `anon${slot.get(p.pid)?.slice(1)}`, country: p.country, bot: false }),
  };
  if (!s) return { ...view, createdMs: d.createdAt };

  const ids = d.questionIds, p = PUZZLES[ids[s.round]];
  const resolved = s.resolvedMs != null;
  const k = resolved ? 4 : clueAt(s, now);
  const roundBuzzes = [...t.rows.filter((b) => b.round === s.round), ...(s.bot ? botRound(s, ids, s.round, s.openMs) : [])]
    .filter((b) => b.atMs <= (resolved ? s.resolvedMs! : now)).sort((a, b) => a.atMs - b.atMs);
  const last = s.log.at(-1);
  return {
    ...view, wins: keyed(s.wins), pts: keyed(s.pts), winner: S(s.winner),
    log: s.log.map((l) => ({ round: l.round, winner: S(l.winner), clue: l.clue, answer: face(PUZZLES[ids[l.round]].player) })),
    round: {
      n: s.round, openMs: s.openMs, endMs: roundEnd(s), clueTimes: WL.CLUE_AT.map((c) => s.openMs + c),
      clue: k, clues: k < 0 ? [] : p.clues.slice(0, k + 1),
      buzzes: roundBuzzes.map((b) => ({ slot: S(b.pid), clue: b.clue, name: whoPlayer(b.pick)?.name ?? "?", correct: b.correct })),
      result: resolved && last ? {
        winner: S(last.winner), clue: last.clue, ms: last.atMs != null && last.clue != null ? last.atMs - (s.openMs + WL.CLUE_AT[last.clue]) : null,
        answer: { ...face(p.player), story: p.story },
      } : null,
      nextMs: resolved ? s.resolvedMs! + WL.RESULT_MS : null,
    },
  };
}

/** A name for the current round. One buzz per clue: a wrong one locks the player out until the next clue lands. */
export async function whoBuzz(duelId: string, pid: string, round: number, pick: string) {
  if (!whoPlayer(pick)) return { error: "Pick a player from the list.", status: 400 } as const;
  const t = await tickWho(duelId);
  const s = t && stateOf(t.d);
  if (!t || !s || t.d.status !== "playing") return { error: "This match isn't running.", status: 409 } as const;
  if (!Object.keys(s.wins).includes(pid)) return { error: "You're not in this match.", status: 403 } as const;
  const now = Date.now(), clue = clueAt(s, now);
  if (round !== s.round || s.resolvedMs != null || clue < 0 || now > roundEnd(s)) return { error: "That round's over.", status: 409 } as const;
  const correct = pick === PUZZLES[t.d.questionIds[round]].player;
  const db = await getDb();
  const ins = await db.insert(whoBuzzes).values({ duelId, playerId: pid, round, clue, pick, correct, atMs: now }).onConflictDoNothing().returning();
  if (!ins.length) return { error: "Locked until the next clue.", status: 409, locked: true } as const;
  await tickWho(duelId); // a right name ends the round at once
  return { ok: true, correct, clue } as const;
}
