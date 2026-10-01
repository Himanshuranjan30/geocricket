// Pure rules for "Who's the Player?" (no I/O), shared by the API and tests.
export type Clue = { kind: "pin" | "match" | "numbers" | "trail" | "initials"; text: string; pins?: [number, number][] };

export const POINTS = [100, 80, 60, 40, 20];
export const CLUES = 5;
export const PER_DAY = 3;

type G = { step: number; pick: string | null; correct: boolean };
/** Where a player stands on one puzzle, from their guesses (any order). */
export function puzzleState(guesses: G[]) {
  const sorted = [...guesses].sort((a, b) => a.step - b.step);
  const hit = sorted.find((g) => g.correct);
  const solvedAt = hit ? hit.step : null;
  const step = hit ? hit.step : Math.min(sorted.length, CLUES);
  const done = solvedAt !== null || sorted.length >= CLUES;
  return { step, solvedAt, done, points: solvedAt === null ? 0 : POINTS[solvedAt], picks: sorted.filter((g) => !g.correct).map((g) => g.pick) };
}

export const tile = (solvedAt: number | null) => (solvedAt === null ? "🟥" : solvedAt <= 1 ? "🟩" : solvedAt === 2 ? "🟨" : "🟧");
export function shareText(number: number, steps: (number | null)[], total: number, betterThan: number | null, url: string) {
  return [
    `🏏 GeoCricket · Mystery Cricketer #${number}`,
    `${steps.map(tile).join("")}  ${total}/${PER_DAY * POINTS[0]}`,
    `Clues: ${steps.map((s) => (s === null ? "✗" : s + 1)).join(" · ")}`,
    ...(betterThan !== null ? [`Better than ${betterThan}% of players today`] : []),
    url,
  ].join("\n");
}
