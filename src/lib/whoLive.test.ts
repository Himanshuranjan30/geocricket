import { describe, expect, it } from "vitest";
import { advance, botBuzzes, clueAt, initialWho, makeBot, roundEnd, WL, type Buzz } from "./whoLive";

const T0 = 1_000_000;
const A = "a", B = "b";
const at = (open: number, clue: number, plus = 1000) => open + WL.CLUE_AT[clue] + plus;
const right = (pid: string, round: number, clue: number, atMs: number): Buzz => ({ pid, round, clue, pick: "x", correct: true, atMs });

describe("Name Race", () => {
  it("reveals clues on the clock", () => {
    const s = initialWho([A, B], T0);
    expect(clueAt(s, s.openMs - 1)).toBe(-1);
    expect(clueAt(s, s.openMs)).toBe(0);
    expect(clueAt(s, s.openMs + WL.CLUE_AT[1])).toBe(1);
    expect(clueAt(s, roundEnd(s))).toBe(4);
  });

  it("first correct name wins the round and scores that clue", () => {
    const s = initialWho([A, B], T0);
    const bz = [right(B, 0, 2, at(s.openMs, 2, 3000)), right(A, 0, 2, at(s.openMs, 2, 2000))];
    const n = advance(s, at(s.openMs, 2, 3500), () => bz);
    expect(n.log[0]).toMatchObject({ winner: A, clue: 2 });
    expect(n.wins).toEqual({ a: 1, b: 0 });
    expect(n.pts.a).toBe(60);
    expect(n.resolvedMs).toBe(at(s.openMs, 2, 2000));
  });

  it("ignores future buzzes and wrong names; nobody → drawn round at the end", () => {
    const s = initialWho([A, B], T0);
    const bz: Buzz[] = [{ pid: A, round: 0, clue: 0, pick: "y", correct: false, atMs: at(s.openMs, 0) }, right(B, 0, 4, roundEnd(s) + 5)];
    expect(advance(s, at(s.openMs, 3), () => bz)).toBe(s); // still running
    const n = advance(s, roundEnd(s), () => bz);
    expect(n.log[0]).toMatchObject({ winner: null, clue: null });
    expect(n.wins).toEqual({ a: 0, b: 0 });
  });

  it("opens the next round after the reveal and ends at three wins", () => {
    let s = initialWho([A, B], T0);
    const bz: Buzz[] = [];
    for (let r = 0; r < 3; r++) {
      bz.push(right(A, r, 0, s.openMs + 500));
      s = advance(s, s.openMs + 600, (round) => bz.filter((b) => b.round === round));
      if (r < 2) { expect(s.winner).toBeNull(); s = advance(s, s.resolvedMs! + WL.RESULT_MS, () => []); expect(s.round).toBe(r + 1); }
    }
    expect(s.winner).toBe(A);
    expect(s.wins.a).toBe(3);
  });

  it("after five rounds: rounds won, then points, else a draw", () => {
    const play = (results: [string | null, number][]) => {
      let s = initialWho([A, B], T0);
      results.forEach(([w, clue], r) => {
        const bz = w ? [right(w, r, clue, at(s.openMs, clue))] : [];
        s = advance(s, w ? at(s.openMs, clue) : roundEnd(s), () => bz);
        if (!s.winner) s = advance(s, s.resolvedMs! + WL.RESULT_MS, () => []);
      });
      return s;
    };
    expect(play([[A, 0], [B, 0], [null, 0], [A, 0], [B, 0]]).winner).toBe("draw");
    expect(play([[A, 0], [B, 1], [null, 0], [A, 1], [B, 1]]).winner).toBe(A); // 2–2, 180 v 160
    expect(play([[A, 0], [null, 0], [null, 0], [null, 0], [null, 0]]).winner).toBe(A);
  });

  it("bot plays a whole, repeatable round inside the clock", () => {
    const bot = makeBot(42);
    const s = initialWho([A, bot.pid], T0, bot);
    for (let r = 0; r < 20; r++) {
      const bz = botBuzzes({ ...bot, seed: r }, 0, s.openMs, 9, "ans", ["d1", "d2"]);
      expect(botBuzzes({ ...bot, seed: r }, 0, s.openMs, 9, "ans", ["d1", "d2"])).toEqual(bz);
      expect(new Set(bz.map((b) => b.clue)).size).toBe(bz.length); // one buzz per clue
      for (const b of bz) { expect(b.atMs).toBeGreaterThanOrEqual(at(s.openMs, b.clue, 0)); expect(b.atMs).toBeLessThan(roundEnd(s)); expect(clueAt(s, b.atMs)).toBe(b.clue); }
      expect(bz.filter((b) => b.correct).every((b) => b.pick === "ans")).toBe(true);
    }
  });
});
