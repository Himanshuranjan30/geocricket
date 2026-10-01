import { describe, expect, it } from "vitest";
import { addDays } from "./game";
import { saveable, streakOf } from "./streak";

const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("streak", () => {
  it("counts consecutive days and stays alive until today ends", () => {
    const days = run("2026-10-01", 3); // Thu–Sat
    expect(streakOf(days, "2026-10-03")).toMatchObject({ current: 3, playedToday: true, atRisk: false });
    expect(streakOf(days, "2026-10-04")).toMatchObject({ current: 3, playedToday: false, atRisk: true });
  });

  it("a missed day is frozen automatically, once per week, and doesn't add to the count", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-04"]; // missed Sat 3rd
    expect(streakOf(days, "2026-10-04")).toMatchObject({ current: 3, frozen: ["2026-10-03"], freezeLeft: false });
    // Yesterday missed and today not played yet: the freeze holds the streak, at risk.
    expect(streakOf(["2026-10-01", "2026-10-02"], "2026-10-04")).toMatchObject({ current: 2, frozen: ["2026-10-03"], atRisk: true });
  });

  it("breaks on a second miss in the same week, or two days in a row", () => {
    expect(streakOf(["2026-09-28", "2026-09-30", "2026-10-02"], "2026-10-02")).toMatchObject({ current: 1 }); // Mon, Wed, Fri
    expect(streakOf(["2026-10-01"], "2026-10-04").current).toBe(0); // missed 2nd and 3rd
  });

  it("the freeze resets each Monday", () => {
    const days = ["2026-09-28", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-06"];
    expect(streakOf(days, "2026-10-06")).toMatchObject({ current: 7, frozen: ["2026-09-29", "2026-10-05"], freezeLeft: false });
  });

  it("tracks the best run and ignores future days", () => {
    const days = [...run("2026-09-01", 10), ...run("2026-09-20", 4), "2026-12-01"];
    expect(streakOf(days, "2026-09-23")).toMatchObject({ current: 4, best: 10 });
    expect(streakOf([], "2026-09-23")).toMatchObject({ current: 0, best: 0, atRisk: false });
  });

  it("a rewarded save bridges yesterday once the weekly freeze is spent, once a week", () => {
    const days = ["2026-09-28", "2026-09-29", "2026-10-01"]; // missed Wed 30th (freeze) and Fri 2nd
    expect(streakOf(days, "2026-10-03").current).toBe(0);
    expect(saveable(days, [], "2026-10-03")).toBe(3);
    expect(streakOf(days, "2026-10-03", ["2026-10-02"])).toMatchObject({ current: 3, atRisk: true, frozen: ["2026-09-30", "2026-10-02"] });
    expect(saveable(days, ["2026-10-02"], "2026-10-03")).toBe(0); // already saved this week
    expect(saveable([...days, "2026-10-02"], [], "2026-10-03")).toBe(0); // nothing missed
    expect(saveable(["2026-09-28"], [], "2026-10-03")).toBe(0); // more than one day gone
  });
});
