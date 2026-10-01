// Badge tracks (shared by server and client). Each track has four tiers with steep jumps: Bronze is a first real
// milestone, Platinum is for the top ~1% of players. Only signed-in, fair play counts (see lib/career.ts).
export const TIERS = ["Bronze", "Silver", "Gold", "Platinum"] as const;
export type Tier = (typeof TIERS)[number];

export const TRACKS = [
  { id: "dailies", icon: "calendar", name: "Ever Present", desc: "Dailies played", tiers: [7, 30, 100, 365] },
  { id: "streak", icon: "flame", name: "Unbroken", desc: "Longest daily streak", tiers: [7, 30, 100, 365] },
  { id: "perfects", icon: "target", name: "Dead Eye", desc: "Perfect 100s in Dailies and Test Matches", tiers: [10, 50, 200, 1000] },
  { id: "best", icon: "star", name: "Masterclass", desc: "Best Daily score (of 1,000)", tiers: [800, 900, 950, 1000] },
  { id: "tests", icon: "stadium", name: "Test Cricketer", desc: "Test Matches finished", tiers: [5, 25, 100, 300] },
  { id: "nets", icon: "net", name: "Net Grinder", desc: "Balls faced in the Nets", tiers: [100, 1000, 5000, 20000] },
  { id: "duels", icon: "swords", name: "Duel King", desc: "Friend duels won (max 3 per rival)", tiers: [5, 25, 100, 500] },
  { id: "top10", icon: "trophy", name: "World Class", desc: "Days finished in the world top 10 (25+ players)", tiers: [1, 10, 50, 200] },
  { id: "podium", icon: "medal", name: "Podium", desc: "Days finished in the world top 3 (25+ players)", tiers: [1, 5, 25, 100] },
  { id: "legends", icon: "crown", name: "Collector", desc: "Legends unlocked", tiers: [1, 5, 15, 30] },
  { id: "level", icon: "rocket", name: "Career", desc: "Level reached", tiers: [10, 20, 30, 40] },
  { id: "cupWins", icon: "trophy", name: "Champion", desc: "Cups won (cups with 4+ signed-in players)", tiers: [1, 5, 25, 100] },
  { id: "cupHosts", icon: "crown", name: "Host", desc: "Cups hosted that 8+ signed-in players finished", tiers: [1, 5, 25, 100] },
] as const;

export type TrackId = (typeof TRACKS)[number]["id"];

/** Highest tier reached (-1 = none) and the next target. */
export function tierOfTrack(tiers: readonly number[], value: number) {
  let t = -1;
  tiers.forEach((x, i) => { if (value >= x) t = i; });
  return { tier: t, next: tiers[t + 1] ?? null, prev: t >= 0 ? tiers[t] : 0 };
}
