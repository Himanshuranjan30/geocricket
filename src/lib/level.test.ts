import { describe, expect, it } from "vitest";
import { levelOf, testBallXp, xpAfter, xpForLevel } from "./level";

describe("levels", () => {
  it("starts at level 1 and climbs by the curve", () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(299).level).toBe(1);
    expect(levelOf(300).level).toBe(2);
    expect(levelOf(900).level).toBe(3);
    expect(xpForLevel(10)).toBe(13500);
  });
  it("reports progress inside a level", () => {
    const l = levelOf(600); // level 2: 300..900
    expect(l.intoLevel).toBe(300);
    expect(l.forNext).toBe(600);
    expect(l.progress).toBeCloseTo(0.5);
  });
});

describe("Test Match stakes", () => {
  it("doubles XP for a good ball, costs XP for a poor one, never drops a level", () => {
    expect(testBallXp(80, 2)).toBe(320);
    expect(testBallXp(19, 3)).toBe(-20);
    expect(xpAfter(1000, -20)).toBe(980); // level 3 starts at 900
    expect(xpAfter(905, -20)).toBe(900); // floored at the level start
    expect(xpAfter(0, -20)).toBe(0);
    expect(xpAfter(900, 60)).toBe(960);
  });
});
