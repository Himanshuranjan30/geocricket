// GeoCricket Ranking: one number (0–1000) for how good a player really is, modelled on the ICC player rankings.
// Every scored game counts (Daily, Evening Daily, Test Matches, Match Days) by how much of the maximum you scored,
// weighted by balls (a 10-ball Test counts twice a 5-ball Daily) and by recency (half-life 14 days), so current form
// matters most. Consistency then scales it: playing on 10 of the last 14 days keeps the full number, fewer trims up to
// 30%, so a lucky one-off can't top the table. Under 5 games in 90 days the ranking is provisional.
import { addDays } from "./game";

export const HALF_LIFE_DAYS = 14, WINDOW_DAYS = 90, PROVISIONAL_GAMES = 5, CONSISTENCY_DAYS = 14, FULL_CONSISTENCY = 10;

export type RankedGame = { day: string; pct: number; balls: number }; // pct: share of the round's maximum, 0–1
export type Ranking = { points: number; form: number; consistency: number; games: number; provisional: boolean };

const ageDays = (day: string, today: string) => Math.round((Date.parse(today) - Date.parse(day)) / 864e5);

export function rankingOf(games: RankedGame[], today: string): Ranking | null {
  const recent = games.filter((g) => { const a = ageDays(g.day, today); return a >= 0 && a < WINDOW_DAYS; });
  if (!recent.length) return null;
  let w = 0, s = 0;
  for (const g of recent) { const wt = g.balls * 0.5 ** (ageDays(g.day, today) / HALF_LIFE_DAYS); w += wt; s += wt * Math.max(0, Math.min(1, g.pct)); }
  const form = s / w;
  const days = new Set(recent.filter((g) => ageDays(g.day, today) < CONSISTENCY_DAYS).map((g) => g.day)).size;
  const consistency = 0.7 + 0.3 * Math.min(1, days / FULL_CONSISTENCY);
  return { points: Math.round(1000 * form * consistency), form: Math.round(form * 1000), consistency: Math.round(consistency * 100), games: recent.length, provisional: recent.length < PROVISIONAL_GAMES };
}

/** Accuracy: average points per ball (0–100); needs `minBalls` to count. */
export const accuracyOf = (points: number[], minBalls = 25) => (points.length < minBalls ? null : Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 10) / 10);

/** First day of the rolling window that ends today. */
export const windowStart = (today: string, days: number) => addDays(today, -(days - 1));
