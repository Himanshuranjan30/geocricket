// XP → level (levels unlock legends in the Locker). Level L needs 150·L·(L−1) XP: 300, 900, 1800, 3000…

export const xpForLevel = (level: number) => 150 * level * (level - 1);

export function levelOf(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level), next = xpForLevel(level + 1);
  return { level, xp, intoLevel: xp - floor, forNext: next - floor, progress: (xp - floor) / (next - floor) };
}


// Career titles by level: the ladder a player climbs (shown on the profile, account chip and leaderboards).
export const TITLES = [
  { level: 1, name: "Net bowler" }, { level: 3, name: "Club cricketer" }, { level: 6, name: "County pro" }, { level: 9, name: "First-class regular" },
  { level: 12, name: "Test debutant" }, { level: 16, name: "Test regular" }, { level: 20, name: "Vice-captain" }, { level: 25, name: "Captain" },
  { level: 30, name: "Hall of Famer" }, { level: 40, name: "GOAT" },
];
export const titleFor = (level: number) => [...TITLES].reverse().find((t) => level >= t.level)!.name;
export const nextTitle = (level: number) => TITLES.find((t) => t.level > level) ?? null;

// Test Match stakes: good balls earn double XP, a poor ball (under 20 points) costs XP. See addXp for the floor.
export const TEST_PENALTY_XP = 20;
export const testBallXp = (points: number, mult: number) => (points >= 20 ? points * mult * 2 : -TEST_PENALTY_XP);
/** XP after a change: never below the start of the current level, so nobody loses a level or unlocked legends. */
export const xpAfter = (xp: number, delta: number) => Math.max(xpForLevel(levelOf(xp).level), xp + Math.round(delta));
