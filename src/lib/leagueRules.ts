// Weekly leagues (Duolingo-style), the pure rules shared by server and client. Signed-in players who earn XP in a
// Mon–Sun week (IST) are placed in a cohort of up to 30 players of their tier. At the week's end the top of each cohort
// moves up a tier and the bottom moves down. Every mode's XP counts; Nets and archive balls count half (lib/server addXp).

export const LEAGUES = ["Gully", "Club", "District", "State", "Zonal", "First-class", "International", "World XI"] as const;
export const COHORT_SIZE = 30;
export const MIN_PROMOTION_XP = 100; // a token week never promotes anyone
export const leagueName = (tier: number) => `${LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, tier))]} League`;

/** How many of a cohort of `n` go up and down. Small cohorts (early days) still promote their winner; nobody drops below 10. */
export function zones(n: number, tier: number) {
  return {
    promote: tier >= LEAGUES.length - 1 ? 0 : n <= 1 ? n : Math.max(1, Math.round(n * 0.2)),
    demote: tier <= 0 || n < 10 ? 0 : Math.round(n * 0.2),
  };
}

export type Member = { playerId: string; tier: number; xp: number; updatedMs: number };
/** Most XP first; on a tie, whoever got there first. */
export const byStanding = (a: Member, b: Member) => b.xp - a.xp || a.updatedMs - b.updatedMs;

/** One cohort's end-of-week result: rank, outcome and the tier each player plays next week. */
export function settleCohort(members: Member[]) {
  const sorted = [...members].sort(byStanding);
  const n = sorted.length;
  return sorted.map((m, i) => {
    const z = zones(n, m.tier);
    const outcome: "up" | "down" | "stay" = i < z.promote && m.xp >= MIN_PROMOTION_XP ? "up" : i >= n - z.demote ? "down" : "stay";
    return { playerId: m.playerId, rank: i + 1, outcome, tier: m.tier + (outcome === "up" ? 1 : outcome === "down" ? -1 : 0) };
  });
}
