import { describe, expect, it } from "vitest";
import { advance, duelPoints, initialState, LIVE } from "./live";

const T0 = 1_000_000;
const start = () => initialState(["a", "b"], T0);
const open = T0 + LIVE.START_DELAY_MS;

describe("live 1v1", () => {
  it("waits while the round is running and nobody has guessed", () => {
    const s = start();
    expect(advance(s, open + 5000, () => ({}))).toBe(s);
  });

  it("resolves as soon as both guess, damaging the lower score", () => {
    const s = advance(start(), open + 3000, () => ({ a: 80, b: 30 }));
    expect(s.resolvedMs).toBe(open + 3000);
    expect(s.hp).toEqual({ a: LIVE.HP, b: LIVE.HP - 50 });
    expect(s.log[0]).toMatchObject({ loser: "b", damage: 50 });
  });

  it("the first guess starts a countdown; a missing guess scores 0", () => {
    const s0 = { ...start(), firstGuessMs: open + 2000 };
    expect(advance(s0, open + 11_000, () => ({ a: 60 })).resolvedMs).toBeNull(); // 9s into the countdown
    const s = advance(s0, open + 12_500, () => ({ a: 60 }));
    expect(s.resolvedMs).toBe(open + 2000 + LIVE.AFTER_FIRST_MS);
    expect(s.hp.b).toBe(LIVE.HP - 60);
  });

  it("moves to the next round after the result screen, with a bigger multiplier later", () => {
    let s = advance(start(), open + 1000, () => ({ a: 50, b: 50 })); // draw round, no damage
    s = advance(s, open + 1000 + LIVE.RESULT_MS, () => ({}));
    expect(s.round).toBe(1);
    s = { ...s, round: 4, resolvedMs: null, firstGuessMs: null };
    s = advance(s, s.openMs + 1000, () => ({ a: 100, b: 0 })); // round 5 (index 4): ×2
    expect(s.hp.b).toBe(LIVE.HP - 200);
  });

  it("ends when someone reaches 0 HP", () => {
    const s = advance({ ...start(), hp: { a: LIVE.HP, b: 40 } }, open + 1000, () => ({ a: 90, b: 20 }));
    expect(s.winner).toBe("a");
    expect(s.hp.b).toBe(0);
  });

  it("real duel guesses thousands of km off still deal damage (they all scored 0 before)", () => {
    // Round 1 of a production duel: 6,333 km vs 2,757 km off. On the 0–100 daily scale both were 0 → no damage.
    const a = duelPoints(6333), b = duelPoints(2757);
    expect(b).toBeGreaterThan(a);
    const s = advance(start(), open + 3000, () => ({ a, b }));
    expect(s.log[0].loser).toBe("a");
    expect(s.log[0].damage).toBeGreaterThan(900);
    expect(duelPoints(10)).toBe(5000);
    expect(duelPoints(20000)).toBe(0);
    for (const km of [100, 500, 1000, 3000, 8000]) expect(duelPoints(km)).toBeGreaterThan(duelPoints(km * 1.2)); // always strictly closer = more
  });
});
