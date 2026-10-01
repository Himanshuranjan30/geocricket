// Live 1v1 rules (GeoGuessr Duels style), as a pure state machine so both the API and tests can drive it.
// Everyone sees the same question at the same time. The first guess starts a short countdown for the other player.
// The lower score takes damage = points difference × round multiplier. First to 0 HP loses.

export const LIVE = {
  HP: 6000,
  ROUNDS: 10,
  START_DELAY_MS: 4000, // countdown before round 1
  ROUND_MAX_MS: 30_000, // hard cap per round
  AFTER_FIRST_MS: 10_000, // countdown once one player has guessed
  RESULT_MS: 7000, // result screen between rounds
  QUICK_WAIT_MS: 90_000, // quick-match lobbies older than this aren't matched
} as const;

/**
 * Duel points for one guess, GeoGuessr-style on a world scale: 5,000 for a pin within 25 km, then decaying over
 * thousands of km (1,000 km ≈ 3,000 · 3,000 km ≈ 1,100 · 8,000 km ≈ 90). Daily-game points (0–100, venue scale) drop
 * to 0 beyond a few hundred km, which made nearly every duel round 0–0 with no damage.
 */
export const duelPoints = (km: number) => (km <= 25 ? 5000 : Math.round(5000 * Math.exp(-km / 2000)));

export const roundMult = (round: number) => [1, 1, 1.5, 1.5, 2, 2, 3, 3, 3, 3][round] ?? 3;

export type LiveState = {
  v: number; // version for compare-and-set updates
  round: number;
  openMs: number;
  firstGuessMs: number | null;
  resolvedMs: number | null;
  hp: Record<string, number>;
  log: { round: number; damage: number; loser: string | null; points: Record<string, number> }[];
  winner: string | null; // player id, or "draw"
};

export const initialState = (players: [string, string], now: number): LiveState => ({
  v: 0, round: 0, openMs: now + LIVE.START_DELAY_MS, firstGuessMs: null, resolvedMs: null,
  hp: { [players[0]]: LIVE.HP, [players[1]]: LIVE.HP }, log: [], winner: null,
});

export const deadline = (s: LiveState) =>
  Math.min(s.openMs + LIVE.ROUND_MAX_MS, s.firstGuessMs == null ? Infinity : s.firstGuessMs + LIVE.AFTER_FIRST_MS);

/**
 * Move the duel forward to `now`. `points` holds this round's scored guesses (player id → points).
 * Returns the new state (same object reference if nothing changed).
 */
export function advance(s: LiveState, now: number, points: (round: number) => Record<string, number>): LiveState {
  let state = s;
  for (let guard = 0; guard < LIVE.ROUNDS * 2 && !state.winner; guard++) {
    const ids = Object.keys(state.hp);
    if (state.resolvedMs == null) {
      const p = points(state.round);
      const bothIn = ids.every((id) => id in p);
      if (!(bothIn || now >= deadline(state))) break; // round still running
      const [a, b] = ids, pa = p[a] ?? 0, pb = p[b] ?? 0;
      const damage = Math.round(Math.abs(pa - pb) * roundMult(state.round));
      const loser = pa === pb ? null : pa < pb ? a : b;
      const hp = { ...state.hp };
      if (loser) hp[loser] = Math.max(0, hp[loser] - damage);
      const resolvedMs = bothIn ? Math.min(now, deadline(state)) : deadline(state);
      const out = ids.filter((id) => hp[id] <= 0);
      const last = state.round >= LIVE.ROUNDS - 1;
      const winner = out.length ? ids.find((id) => hp[id] > 0) ?? "draw" : last ? (hp[a] === hp[b] ? "draw" : hp[a] > hp[b] ? a : b) : null;
      state = { ...state, v: state.v + 1, hp, resolvedMs, winner, log: [...state.log, { round: state.round, damage, loser, points: { [a]: pa, [b]: pb } }] };
    } else {
      if (now < state.resolvedMs + LIVE.RESULT_MS) break; // showing the result
      state = { ...state, v: state.v + 1, round: state.round + 1, openMs: state.resolvedMs + LIVE.RESULT_MS, firstGuessMs: null, resolvedMs: null };
    }
  }
  return state;
}
