import { describe, expect, it } from "vitest";
import { addDays } from "./game";
import { accuracyOf, rankingOf } from "./rankingRules";

const today = "2026-10-20";
const daily = (ago: number, pct: number) => ({ day: addDays(today, -ago), pct, balls: 5 });

describe("GeoCricket Ranking", () => {
  it("rewards form and consistency: a steady regular beats a one-off high score", () => {
    const regular = rankingOf(Array.from({ length: 12 }, (_, i) => daily(i, 0.7)), today)!;
    const oneOff = rankingOf([daily(0, 0.95)], today)!;
    expect(regular.points).toBe(700); // 12 of the last 14 days: full consistency
    expect(oneOff.points).toBe(Math.round(950 * 0.73)); // 1 day: 0.7 + 0.3 × 1/10
    expect(regular.points).toBeGreaterThan(oneOff.points);
    expect(oneOff.provisional).toBe(true);
    expect(regular.provisional).toBe(false);
  });

  it("recent games weigh more, Tests weigh double, and games older than 90 days drop out", () => {
    const rising = rankingOf([daily(30, 0.2), daily(0, 0.8)], today)!;
    expect(rising.form).toBeGreaterThan(650); // today's 0.8 dominates a month-old 0.2
    const test = rankingOf([{ day: today, pct: 1, balls: 10 }, daily(0, 0)], today)!;
    expect(test.form).toBe(667);
    expect(rankingOf([daily(90, 1)], today)).toBeNull();
  });

  it("needs enough balls for accuracy", () => {
    expect(accuracyOf([100, 50], 25)).toBeNull();
    expect(accuracyOf(Array(25).fill(64))).toBe(64);
  });
});
