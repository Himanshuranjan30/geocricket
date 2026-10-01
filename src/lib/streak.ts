// The daily streak, one rule everywhere (home, results, bell, push, badges): a day counts when you finish any scored
// game that day (IST). One freeze per Mon–Sun week bridges a single missed day on its own; a frozen day keeps the
// streak alive but doesn't add to it. Computed from the days played, so nothing to store and nothing to drift.
import { addDays, weekOf } from "./game";

export type Streak = { current: number; best: number; frozen: string[]; playedToday: boolean; atRisk: boolean; freezeLeft: boolean };

export function streakOf(days: Iterable<string>, today: string, saved: Iterable<string> = []): Streak {
  const set = new Set([...days].filter((d) => d <= today)), kept = new Set(saved);
  const first = [...set].sort()[0];
  let run = 0, best = 0, frozen: string[] = [];
  const usedWeeks = new Set<string>();
  // ponytail: walks every day since the first game (~365 steps a year); fine for per-player calls.
  for (let d = first; first && d <= today; d = addDays(d, 1)) {
    if (set.has(d)) { run++; best = Math.max(best, run); continue; }
    if (kept.has(d)) { frozen.push(d); continue; } // saved with a rewarded ad: bridges like a freeze
    if (d === today) break; // today isn't over: the streak is still alive
    const next = addDays(d, 1);
    if (run > 0 && !usedWeeks.has(weekOf(d)) && set.has(addDays(d, -1)) && (set.has(next) || next === today)) {
      usedWeeks.add(weekOf(d)); frozen.push(d); // a single missed day, bridged by this week's freeze
    } else { run = 0; frozen = []; }
  }
  const playedToday = set.has(today);
  return { current: run, best, frozen, playedToday, atRisk: run > 0 && !playedToday, freezeLeft: !usedWeeks.has(weekOf(today)) };
}

/** Yesterday's miss can be saved with a rewarded ad, once a week, when that restores a streak the weekly freeze
 * couldn't. Returns the streak it would restore (0 = nothing to save). */
export function saveable(days: string[], saved: string[], today: string) {
  const y = addDays(today, -1);
  if (saved.some((d) => weekOf(d) === weekOf(y))) return 0;
  const now = streakOf(days, today, saved).current, then = streakOf(days, today, [...saved, y]).current;
  return then > now ? then : 0;
}

/** IST calendar day of an instant. */
export const istDayOf = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ms));
