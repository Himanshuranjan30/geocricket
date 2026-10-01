// GeoCricket Cups: knockout tournaments run as a pure state machine (no I/O, clock injected), like the live 1v1 rules
// in live.ts. The server layer (cups.ts) feeds it entrants and match results and persists what it returns with a
// version check, so concurrent ticks can never double-advance. Every match is a live 1v1 (duels, kind "cup").

export const CUP = {
  SIZES: [4, 8, 16, 32] as const,
  MIN_PLAYERS: 4,
  CHECKIN_MS: 10 * 60_000, // check-in opens this long before the start
  DELAY_MS: 15 * 60_000, // one automatic delay when too few checked in
  FIRST_ROUND_LEAD_MS: 20_000, // countdown between seeding and the first ball
  BETWEEN_MS: 45_000, // bracket reveal between rounds
  NO_SHOW_MS: 45_000, // a player who hasn't opened their match this long after it opens loses by walkover
  MATCH_CAP_MS: 8 * 60_000, // hard stop for a match (the live engine finishes in ≤ ~6.5 min)
} as const;

export type Phase = "lobby" | "checkin" | "running" | "done" | "cancelled";
export type Fixture = {
  slot: number;
  a: string | null; // player id (null = bye)
  b: string | null;
  winner: string | null; // set once decided
  how: "played" | "bye" | "walkover" | "cap" | null;
};
export type CupState = {
  v: number;
  phase: Phase;
  startsMs: number;
  delayed: boolean;
  round: number; // current round index
  roundStartsMs: number | null; // when the current round's matches open
  rounds: Fixture[][];
  seeds: Record<string, number>; // player id → seed (1 = top)
  places: Record<string, number>; // player id → final place (1, 2, 3, 5, 9, 17)
  winner: string | null;
  runnerUp: string | null;
  cancelReason: string | null;
};

/** What the server knows about one fixture's live match (absent = not created yet). */
export type MatchInfo = {
  done: boolean;
  winner: string | null; // player id or "draw" (from the live engine)
  openMs: number; // when its first ball opens
  hp: Record<string, number>;
  km: Record<string, number>; // total km off across the match (lower = better), for tiebreaks
  seen: Record<string, boolean>; // has each player opened the match?
};

export const initialCup = (startsMs: number): CupState => ({
  v: 0, phase: "lobby", startsMs, delayed: false, round: 0, roundStartsMs: null, rounds: [], seeds: {}, places: {}, winner: null, runnerUp: null, cancelReason: null,
});

export const bracketSize = (n: number) => CUP.SIZES.find((s) => s >= n) ?? CUP.SIZES[CUP.SIZES.length - 1];
export const roundCount = (size: number) => Math.log2(size);
export function roundName(round: number, rounds: number) {
  const left = rounds - round;
  return left === 1 ? "Final" : left === 2 ? "Semi-final" : left === 3 ? "Quarter-final" : `Round of ${2 ** left}`;
}

/** Standard seeding order for a bracket of `size`: seed 1 meets seed `size`, and top seeds can only meet late. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap((s) => [s, n - s]);
  }
  return order;
}

/** First-round fixtures for players already sorted best seed first. Byes go to the top seeds. */
export function firstRound(sorted: string[]): Fixture[] {
  const size = bracketSize(sorted.length), order = seedOrder(size);
  const fixtures: Fixture[] = [];
  for (let i = 0; i < size; i += 2) {
    const a = sorted[order[i] - 1] ?? null, b = sorted[order[i + 1] - 1] ?? null;
    fixtures.push(b == null ? { slot: i / 2, a, b, winner: a, how: "bye" } : a == null ? { slot: i / 2, a: b, b: null, winner: b, how: "bye" } : { slot: i / 2, a, b, winner: null, how: null });
  }
  return fixtures;
}

/** Who wins a fixture right now, if it can be decided (else null = still playing). */
export function decide(f: Fixture, m: MatchInfo | undefined, now: number, seeds: Record<string, number>): { winner: string; how: Fixture["how"] } | null {
  if (f.winner) return { winner: f.winner, how: f.how };
  const a = f.a!, b = f.b!;
  const better = () => (seeds[a] ?? 99) <= (seeds[b] ?? 99) ? a : b; // higher seed on a dead heat
  const byKm = () => { const ka = m?.km[a] ?? Infinity, kb = m?.km[b] ?? Infinity; return ka < kb ? a : kb < ka ? b : better(); };
  if (!m) return null; // match row not created yet
  if (m.done) {
    if (m.winner && m.winner !== "draw") return { winner: m.winner, how: "played" };
    return { winner: byKm(), how: "played" }; // level on HP after every round: fewer total km wins
  }
  if (now >= m.openMs + CUP.NO_SHOW_MS && !(m.seen[a] && m.seen[b])) {
    if (m.seen[a]) return { winner: a, how: "walkover" };
    if (m.seen[b]) return { winner: b, how: "walkover" };
    return { winner: better(), how: "walkover" };
  }
  if (now >= m.openMs + CUP.MATCH_CAP_MS) {
    const ha = m.hp[a] ?? 0, hb = m.hp[b] ?? 0;
    return { winner: ha > hb ? a : hb > ha ? b : byKm(), how: "cap" };
  }
  return null;
}

const placeFor = (eliminatedRound: number, rounds: number) => 2 ** (rounds - eliminatedRound - 1) + 1;

/**
 * Move a cup forward to `now`. `entrants`: checked-in players, best seed first (the server sorts by rating and
 * join order). `matches`: live match info per fixture key `${round}:${slot}`. Returns the same object if nothing changed.
 */
export function advanceCup(s: CupState, now: number, entrants: string[], matches: Record<string, MatchInfo>): CupState {
  let state = s;
  const bump = (patch: Partial<CupState>) => { state = { ...state, ...patch, v: state.v + 1 }; };
  for (let guard = 0; guard < 16; guard++) {
    const before = state;
    if (state.phase === "lobby" && now >= state.startsMs - CUP.CHECKIN_MS) bump({ phase: "checkin" });
    else if (state.phase === "checkin" && now >= state.startsMs) {
      if (entrants.length < CUP.MIN_PLAYERS) {
        if (!state.delayed) bump({ delayed: true, startsMs: state.startsMs + CUP.DELAY_MS });
        else bump({ phase: "cancelled", cancelReason: `Only ${entrants.length} checked in (needs ${CUP.MIN_PLAYERS}).` });
      } else {
        const field = entrants.slice(0, CUP.SIZES[CUP.SIZES.length - 1]);
        bump({ phase: "running", round: 0, rounds: [firstRound(field)], roundStartsMs: now + CUP.FIRST_ROUND_LEAD_MS, seeds: Object.fromEntries(field.map((p, i) => [p, i + 1])) });
      }
    } else if (state.phase === "running") {
      const r = state.round, total = roundCount(state.rounds[0].length * 2);
      const fixtures = state.rounds[r].map((f) => {
        if (f.winner) return f;
        const m = matches[`${r}:${f.slot}`];
        // Failsafe: a match that never got created (server hiccup) can't stall the cup: higher seed after the cap.
        const d = !m && state.roundStartsMs != null && now >= state.roundStartsMs + CUP.MATCH_CAP_MS
          ? { winner: (state.seeds[f.a!] ?? 99) <= (state.seeds[f.b!] ?? 99) ? f.a! : f.b!, how: "walkover" as const }
          : decide(f, m, now, state.seeds);
        return d ? { ...f, winner: d.winner, how: d.how } : f;
      });
      const changed = fixtures.some((f, i) => f !== state.rounds[r][i]);
      if (changed) bump({ rounds: state.rounds.map((x, i) => (i === r ? fixtures : x)) });
      if (fixtures.every((f) => f.winner)) {
        const places = { ...state.places };
        for (const f of fixtures) for (const p of [f.a, f.b]) if (p && p !== f.winner) places[p] = placeFor(r, total);
        if (r === total - 1) {
          const f = fixtures[0], loser = f.a === f.winner ? f.b : f.a;
          places[f.winner!] = 1;
          bump({ phase: "done", places, winner: f.winner, runnerUp: loser, roundStartsMs: null });
        } else {
          const next: Fixture[] = [];
          for (let i = 0; i < fixtures.length; i += 2) next.push({ slot: i / 2, a: fixtures[i].winner, b: fixtures[i + 1].winner, winner: null, how: null });
          bump({ places, round: r + 1, rounds: [...state.rounds, next], roundStartsMs: now + CUP.BETWEEN_MS });
        }
      }
    }
    if (state === before) break;
  }
  return state;
}

/** The fixture a player is in this round (or null), and whether they're still alive. */
export function myFixture(s: CupState, pid: string) {
  const f = s.rounds[s.round]?.find((x) => x.a === pid || x.b === pid) ?? null;
  return { fixture: f, alive: s.phase !== "done" && !(pid in s.places) && !!s.seeds[pid] };
}
