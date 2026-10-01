import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { advance, deadline, initialState, LIVE, roundMult, type LiveState } from "./live";
import { toAnswer } from "./server";
import { freshFrom, markSeen } from "./seen";

const { duels, duelPlayers, duelGuesses, players, questions } = schema;

export async function duelQuestions(ids: string[]) {
  const db = await getDb();
  const rows = await db.select().from(questions).where(inArray(questions.id, ids));
  const byId = new Map(rows.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)!);
}

export async function duelRoster(duelId: string) {
  const db = await getDb();
  return db.select({ playerId: duelPlayers.playerId, total: duelPlayers.total, joinedMs: duelPlayers.joinedMs, handle: players.handle, avatar: players.avatar, country: players.country, xp: players.xp })
    .from(duelPlayers).leftJoin(players, eq(players.id, duelPlayers.playerId)).where(eq(duelPlayers.duelId, duelId)).orderBy(duelPlayers.joinedMs);
}

export async function guessesFor(duelId: string) {
  const db = await getDb();
  return db.select().from(duelGuesses).where(eq(duelGuesses.duelId, duelId));
}

// ---- live 1v1 ----

/** Find a waiting quick-match lobby from someone else, or null. */
export async function findQuickLobby(pid: string) {
  const db = await getDb();
  const rows = await db.select({ id: duels.id, createdBy: duels.createdBy }).from(duels)
    .where(and(eq(duels.kind, "live"), eq(duels.status, "open"), eq(duels.quick, true), gt(duels.createdAt, Date.now() - LIVE.QUICK_WAIT_MS)))
    .orderBy(desc(duels.createdAt)).limit(5);
  return rows.find((r) => r.createdBy !== pid) ?? null;
}

/** Second player joins an open live duel: start the clock. Returns false if it was already taken. */
export async function joinLive(duelId: string, pid: string) {
  const db = await getDb();
  const [d] = await db.select().from(duels).where(eq(duels.id, duelId));
  if (!d || d.kind !== "live") return false;
  if (d.status !== "open") return (await duelRoster(duelId)).some((p) => p.playerId === pid); // rejoin is fine
  if (d.createdBy === pid) return true;
  const picked = (await freshFrom("versus", LIVE.ROUNDS, [d.createdBy, pid])).questions.map((q) => q.id);
  if (picked.length < 5) return false; // ponytail: pool too thin for these two; bot/replay fallback when Versus pool is big
  const state = initialState([d.createdBy, pid], Date.now());
  // Compare-and-set on status so two people can't both take the last seat.
  const taken = await db.update(duels).set({ status: "playing", state, questionIds: picked }).where(and(eq(duels.id, duelId), eq(duels.status, "open"))).returning();
  if (!taken.length) return false;
  await db.insert(duelPlayers).values({ duelId, playerId: pid, joinedMs: Date.now() }).onConflictDoNothing();
  await Promise.all([markSeen(d.createdBy, picked, "live"), markSeen(pid, picked, "live")]);
  return true;
}

/** Load a live duel and move it forward to now (idempotent; concurrent callers settle via the version check). */
export async function tickLive(duelId: string) {
  const db = await getDb();
  const [d] = await db.select().from(duels).where(eq(duels.id, duelId));
  if (!d) return null;
  if (d.status !== "playing" || !d.state) return d;
  const gs = await guessesFor(duelId);
  const pointsFor = (round: number) => Object.fromEntries(gs.filter((g) => g.idx === round).map((g) => [g.playerId, g.points]));
  const next = advance(d.state, Date.now(), pointsFor);
  if (next === d.state) return d;
  const status = next.winner ? "done" : "playing";
  const saved = await db.update(duels).set({ state: next, status })
    .where(and(eq(duels.id, duelId), sql`(${duels.state}->>'v')::int = ${d.state.v}`)).returning();
  // A live 1v1 just finished (only the tick that won the write gets here): update both skill ratings. Cup matches are
  // rated by the cup layer, which also resolves draws.
  if (saved.length && d.kind === "live" && next.winner && next.winner !== "draw" && !d.state.winner) {
    const [a, b] = Object.keys(next.hp);
    await import("./rating").then((m) => m.rateMatch(a, b, next.winner!)).catch(() => {});
  }
  return saved[0] ?? (await db.select().from(duels).where(eq(duels.id, duelId)))[0];
}

/** Record a first guess time so the other player's countdown starts. */
export async function markFirstGuess(duelId: string, state: LiveState, now: number) {
  if (state.firstGuessMs != null) return;
  const db = await getDb();
  await db.update(duels).set({ state: { ...state, v: state.v + 1, firstGuessMs: now } })
    .where(and(eq(duels.id, duelId), sql`(${duels.state}->>'v')::int = ${state.v}`));
}

export { deadline, roundMult, toAnswer };
