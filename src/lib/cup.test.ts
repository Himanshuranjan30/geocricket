import { describe, expect, it } from "vitest";
import { advanceCup, bracketSize, CUP, decide, firstRound, initialCup, roundName, seedOrder, type CupState, type MatchInfo } from "./cup";

const T = 1_000_000_000;
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const played = (winner: string | "draw", openMs: number, a: string, b: string, extra: Partial<MatchInfo> = {}): MatchInfo =>
  ({ done: true, winner, openMs, hp: { [a]: 100, [b]: 100 }, km: { [a]: 1000, [b]: 2000 }, seen: { [a]: true, [b]: true }, ...extra });

/** Run a cup to the end: every created match is resolved by `play` a minute after its round opens. */
function runCup(n: number, play: (a: string, b: string, openMs: number) => MatchInfo | undefined) {
  let s: CupState = initialCup(T);
  const entrants = players(n), matches: Record<string, MatchInfo> = {}, missing = new Set<string>(); // missing: row never created
  for (let now = T - CUP.CHECKIN_MS - 1; now < T + 6 * 3600e3 && s.phase !== "done" && s.phase !== "cancelled"; now += 15_000) {
    s = advanceCup(s, now, entrants, matches);
    if (s.phase === "running" && s.roundStartsMs != null && now >= s.roundStartsMs) {
      for (const f of s.rounds[s.round]) {
        const key = `${s.round}:${f.slot}`;
        if (f.b && !f.winner && !matches[key] && !missing.has(key)) { const m = play(f.a!, f.b, s.roundStartsMs); if (m) matches[key] = m; else missing.add(key); }
      }
    }
  }
  return s;
}

describe("cup brackets", () => {
  it("seeds so the top two can only meet in the final", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const o = seedOrder(16);
    expect(o.indexOf(1) < 8).toBe(true); expect(o.indexOf(2) >= 8).toBe(true);
  });

  it("gives byes to the top seeds and never pairs two byes", () => {
    for (let n = 4; n <= 32; n++) {
      const r = firstRound(players(n)), size = bracketSize(n);
      expect(r).toHaveLength(size / 2);
      const byes = r.filter((f) => f.how === "bye");
      expect(byes).toHaveLength(size - n);
      for (const f of byes) expect(Number(f.winner!.slice(1))).toBeLessThanOrEqual(size - n); // seeds 1..(byes)
      expect(r.every((f) => f.a != null)).toBe(true);
    }
  });

  it("names rounds", () => {
    expect([0, 1, 2, 3].map((r) => roundName(r, 4))).toEqual(["Round of 16", "Quarter-final", "Semi-final", "Final"]);
  });
});

describe("cup lifecycle", () => {
  it("opens check-in, then delays once, then cancels if too few turn up", () => {
    let s = initialCup(T);
    s = advanceCup(s, T - CUP.CHECKIN_MS, [], {});
    expect(s.phase).toBe("checkin");
    s = advanceCup(s, T, players(3), {});
    expect(s).toMatchObject({ phase: "checkin", delayed: true, startsMs: T + CUP.DELAY_MS });
    s = advanceCup(s, T + CUP.DELAY_MS, players(3), {});
    expect(s.phase).toBe("cancelled");
  });

  it("starts with 4+ and runs to a champion with correct places", () => {
    const s = runCup(8, (a, b, openMs) => played(a < b ? a : b, openMs + 1000, a, b)); // lower id wins
    expect(s.phase).toBe("done");
    expect(s.places[s.winner!]).toBe(1);
    expect(s.places[s.runnerUp!]).toBe(2);
    const counts = Object.values(s.places).reduce<Record<number, number>>((c, p) => ({ ...c, [p]: (c[p] ?? 0) + 1 }), {});
    expect(counts).toEqual({ 1: 1, 2: 1, 3: 2, 5: 4 });
  });

  it("walkovers: a no-show loses, a double no-show goes to the higher seed", () => {
    const f = { slot: 0, a: "p1", b: "p2", winner: null, how: null };
    const base: MatchInfo = { done: false, winner: null, openMs: T, hp: {}, km: {}, seen: { p1: false, p2: true } };
    expect(decide(f, base, T + CUP.NO_SHOW_MS - 1, { p1: 1, p2: 2 })).toBeNull();
    expect(decide(f, base, T + CUP.NO_SHOW_MS, { p1: 1, p2: 2 })).toEqual({ winner: "p2", how: "walkover" });
    expect(decide(f, { ...base, seen: {} }, T + CUP.NO_SHOW_MS, { p1: 1, p2: 2 })).toEqual({ winner: "p1", how: "walkover" });
  });

  it("a drawn match goes to fewer total km, and the hard cap ends a stuck match", () => {
    const f = { slot: 0, a: "p1", b: "p2", winner: null, how: null };
    expect(decide(f, played("draw", T, "p1", "p2", { km: { p1: 900, p2: 400 } }), T, {})).toEqual({ winner: "p2", how: "played" });
    const stuck: MatchInfo = { done: false, winner: null, openMs: T, hp: { p1: 2000, p2: 5000 }, km: {}, seen: { p1: true, p2: true } };
    expect(decide(f, stuck, T + CUP.MATCH_CAP_MS, {})).toEqual({ winner: "p2", how: "cap" });
  });

  it("is idempotent and only moves forward", () => {
    const s0 = advanceCup(initialCup(T), T, players(6), {});
    expect(advanceCup(s0, T, players(6), {})).toBe(s0);
    expect(s0.v).toBeGreaterThan(0);
  });
});

describe("simulation: 10,000 random cups", () => {
  it("always ends with one champion, one winner per match, consistent places", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let i = 0; i < 10_000; i++) {
      const n = 4 + Math.floor(rnd() * 29);
      const s = runCup(n, (a, b, openMs) => {
        const r = rnd();
        if (r < 0.05) return undefined; // match row never created (server hiccup): the failsafe must still end it
        if (r < 0.12) return { done: false, winner: null, openMs, hp: {}, km: {}, seen: { [a]: rnd() < 0.5, [b]: false } }; // no-shows
        if (r < 0.2) return { done: false, winner: null, openMs, hp: { [a]: 3000, [b]: 3000 }, km: { [a]: 5, [b]: 5 }, seen: { [a]: true, [b]: true } }; // stuck → cap
        if (r < 0.3) return played("draw", openMs, a, b, { km: { [a]: rnd() * 1e4, [b]: rnd() * 1e4 } });
        return played(rnd() < 0.5 ? a : b, openMs, a, b);
      });
      expect(s.phase).toBe("done");
      const size = bracketSize(n), rounds = Math.log2(size);
      expect(s.rounds).toHaveLength(rounds);
      expect(Object.keys(s.places)).toHaveLength(n);
      expect(Object.values(s.places).filter((p) => p === 1)).toHaveLength(1);
      for (const [r, fixtures] of s.rounds.entries()) {
        const inRound = fixtures.flatMap((f) => [f.a, f.b]).filter(Boolean);
        expect(new Set(inRound).size).toBe(inRound.length); // nobody twice in a round
        for (const f of fixtures) expect([f.a, f.b]).toContain(f.winner); // winner is one of the two
        if (r > 0) expect(fixtures).toHaveLength(s.rounds[r - 1].length / 2);
      }
    }
  }, 20_000); // 10,000 cups: ~5 s on a busy laptop, over vitest's 5 s default
});
