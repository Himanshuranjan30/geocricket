import { describe, expect, it } from "vitest";
import { LEAGUES, settleCohort, zones } from "./leagueRules";

const m = (xp: number, i: number, tier = 2) => ({ playerId: `p${i}`, tier, xp, updatedMs: i });

describe("league settlement", () => {
  it("promotes the top fifth and relegates the bottom fifth of a full cohort", () => {
    const res = settleCohort(Array.from({ length: 30 }, (_, i) => m(1000 - i * 10, i)));
    expect(res.filter((r) => r.outcome === "up").map((r) => r.playerId)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5"]);
    expect(res.filter((r) => r.outcome === "down")).toHaveLength(6);
    expect(res.find((r) => r.playerId === "p0")).toMatchObject({ rank: 1, tier: 3 });
    expect(res.find((r) => r.playerId === "p29")).toMatchObject({ rank: 30, tier: 1 });
  });

  it("breaks ties by who got there first", () => {
    const res = settleCohort([{ playerId: "late", tier: 0, xp: 500, updatedMs: 9 }, { playerId: "early", tier: 0, xp: 500, updatedMs: 1 }]);
    expect(res[0]).toMatchObject({ playerId: "early", rank: 1, outcome: "up" });
  });

  it("small cohorts promote their winner but never relegate; a token week never promotes", () => {
    expect(settleCohort([m(300, 0), m(200, 1), m(50, 2)]).map((r) => r.outcome)).toEqual(["up", "stay", "stay"]);
    expect(settleCohort([m(40, 0)])[0].outcome).toBe("stay");
  });

  it("the bottom tier can't go down and the top tier can't go up", () => {
    expect(zones(30, 0).demote).toBe(0);
    expect(zones(30, LEAGUES.length - 1).promote).toBe(0);
    const top = settleCohort(Array.from({ length: 12 }, (_, i) => m(1000 - i, i, LEAGUES.length - 1)));
    expect(top.every((r) => r.tier <= LEAGUES.length - 1)).toBe(true);
    const bottom = settleCohort(Array.from({ length: 12 }, (_, i) => m(1000 - i, i, 0)));
    expect(bottom.every((r) => r.tier >= 0)).toBe(true);
  });
});
