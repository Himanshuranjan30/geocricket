// Who's the Player? 1v1 "Name Race" rules, as a pure state machine (no I/O) so the API and tests drive the same code.
// Both players see the same clue at the same moment; a new clue lands every few seconds on a fixed clock. The first
// correct name wins the round and scores that clue's points. A wrong name locks you out until the next clue (one buzz
// per player per clue). First to WIN rounds takes the match; after ROUNDS rounds, most rounds won, then most points.
import { POINTS } from "./whoRules";

export const WL = {
  ROUNDS: 5,
  WIN: 3,
  START_MS: 4000, // countdown before round 1
  CLUE_AT: [0, 8000, 15000, 22000, 29000], // when each clue lands, from the round's open
  ROUND_MS: 36_000, // nobody named him by now: drawn round
  RESULT_MS: 6500, // the reveal between rounds
  QUICK_WAIT_MS: 90_000, // quick-match lobbies older than this aren't matched
  BOT_AFTER_MS: 15_000, // a quick match with nobody to play gets a bot after this long
} as const;

export type Buzz = { pid: string; round: number; clue: number; pick: string; correct: boolean; atMs: number };
export type Bot = { pid: string; handle: string; avatar: string; seed: number };
export type WhoLiveState = {
  v: number; // version for compare-and-set updates
  round: number;
  openMs: number;
  resolvedMs: number | null;
  wins: Record<string, number>;
  pts: Record<string, number>;
  log: { round: number; winner: string | null; clue: number | null; atMs: number | null }[];
  winner: string | null; // player id, or "draw"
  bot?: Bot;
};

export const initialWho = (players: [string, string], now: number, bot?: Bot): WhoLiveState => ({
  v: 0, round: 0, openMs: now + WL.START_MS, resolvedMs: null,
  wins: { [players[0]]: 0, [players[1]]: 0 }, pts: { [players[0]]: 0, [players[1]]: 0 }, log: [], winner: null, ...(bot ? { bot } : {}),
});

/** The clue on show at `now` (0–4), or -1 before the round opens. */
export const clueAt = (s: Pick<WhoLiveState, "openMs">, now: number) => {
  let k = -1;
  for (let i = 0; i < WL.CLUE_AT.length; i++) if (now >= s.openMs + WL.CLUE_AT[i]) k = i;
  return k;
};
export const roundEnd = (s: Pick<WhoLiveState, "openMs">) => s.openMs + WL.ROUND_MS;

/** Move the match forward to `now`. `buzzes(round)` returns that round's buzzes (any order, future ones are ignored). */
export function advance(s: WhoLiveState, now: number, buzzes: (round: number) => Buzz[]): WhoLiveState {
  let state = s;
  for (let guard = 0; guard < WL.ROUNDS * 2 && !state.winner; guard++) {
    if (state.resolvedMs == null) {
      const end = roundEnd(state);
      const hit = buzzes(state.round).filter((b) => b.correct && b.atMs <= now && b.atMs >= state.openMs && b.atMs <= end).sort((a, b) => a.atMs - b.atMs)[0];
      if (!hit && now < end) break; // round still running
      const wins = { ...state.wins }, pts = { ...state.pts };
      if (hit) { wins[hit.pid]++; pts[hit.pid] += POINTS[hit.clue]; }
      const ids = Object.keys(wins), [a, b] = ids;
      const over = ids.some((id) => wins[id] >= WL.WIN) || state.round >= WL.ROUNDS - 1;
      const winner = !over ? null : wins[a] !== wins[b] ? (wins[a] > wins[b] ? a : b) : pts[a] !== pts[b] ? (pts[a] > pts[b] ? a : b) : "draw";
      state = {
        ...state, v: state.v + 1, wins, pts, winner, resolvedMs: hit ? hit.atMs : end,
        log: [...state.log, { round: state.round, winner: hit?.pid ?? null, clue: hit?.clue ?? null, atMs: hit?.atMs ?? null }],
      };
    } else {
      if (now < state.resolvedMs + WL.RESULT_MS) break; // showing the reveal
      state = { ...state, v: state.v + 1, round: state.round + 1, openMs: state.resolvedMs + WL.RESULT_MS, resolvedMs: null };
    }
  }
  return state;
}

// ---- the bot ----

// Seeded (mulberry32) so a bot's whole match follows from one number: nothing to store, same answer on every server.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Which clue the bot names the player on, by how well-known the player is (fame = international moments we hold).
// The weights after the five clues are the chance it never gets him. Tuned to win roughly a third of rounds against
// someone who names stars on clue 2.
const CURVE = { star: [0.12, 0.3, 0.25, 0.15, 0.08, 0.1], known: [0.05, 0.18, 0.27, 0.22, 0.13, 0.15], deep: [0.02, 0.08, 0.2, 0.27, 0.2, 0.23] };
const sample = (w: number[], r: number) => { let acc = 0; for (let i = 0; i < w.length; i++) { acc += w[i]; if (r < acc) return i; } return w.length - 1; };

/** The bot's buzzes for one round: maybe a wrong name first, then the right one (or never). Times are absolute. */
export function botBuzzes(bot: Bot, round: number, openMs: number, fame: number, answer: string, decoys: string[]): Buzz[] {
  const r = rng(bot.seed * 31 + round * 7919);
  const right = sample(fame >= 8 ? CURVE.star : fame >= 5 ? CURVE.known : CURVE.deep, r());
  const at = (clue: number) => openMs + WL.CLUE_AT[clue] + 2500 + Math.floor(r() * 4000); // reads the clue, then types
  const out: Buzz[] = [];
  const wrongClue = right > 0 && r() < 0.35 ? Math.floor(r() * Math.min(right, 5)) : null;
  if (wrongClue !== null && decoys.length) out.push({ pid: bot.pid, round, clue: wrongClue, pick: decoys[Math.floor(r() * decoys.length)], correct: false, atMs: at(wrongClue) });
  if (right < 5) out.push({ pid: bot.pid, round, clue: right, pick: answer, correct: true, atMs: at(right) });
  return out;
}

const NAMES = ["Doosra", "Yorker", "Googly", "Dilscoop", "Slogsweep", "Nightwatch", "Teesra", "Carrom", "Gully", "Silly Point"];
export const makeBot = (seed: number): Bot => ({ pid: `bot:${seed}`, handle: `${NAMES[seed % NAMES.length]} Bot`, avatar: `anon${seed % 2}`, seed });
export const isBot = (pid: string) => pid.startsWith("bot:");
